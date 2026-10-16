import Fastify, { type FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { AUTH, applyDeskEdit, avatarSchema, mapSchema, validateForPublish, type MapData } from '@office3d/shared';
import type { Config } from './config';
import type { Db } from './db';
import { schema } from './db';
import * as auth from './auth';
import type { Hub } from './hub';

const { users, mapVersions, mapDraft } = schema;
type UserRow = auth.UserRow;
declare module 'fastify' {
  interface FastifyRequest { user?: UserRow; token?: string }
}

const publicUser = (u: UserRow) => ({
  id: u.id, username: u.username, displayName: u.displayName, department: u.department,
  jobTitle: u.jobTitle, role: u.role, disabled: u.disabled, mustChangePassword: u.mustChangePassword,
});
const usernameRe = /^[a-z0-9._-]{3,32}$/;
const password = z.string().min(AUTH.minPasswordLength, `รหัสผ่านต้องยาวอย่างน้อย ${AUTH.minPasswordLength} ตัวอักษร`).max(200);

export async function buildApp(db: Db, config: Pick<Config, 'secureCookie'>, hub: Hub) {
  const app = Fastify({ trustProxy: true, logger: process.env.NODE_ENV !== 'test' });
  await app.register(cookie);

  // --- session + forced password change gate ---
  app.addHook('preHandler', async (req, reply) => {
    const token = req.cookies.sid;
    const user = await auth.userForToken(db, token);
    if (user) { req.user = user; req.token = token; }
    const path = req.url.split('?')[0];
    const open = ['/api/health', '/api/auth/login'];
    if (!path.startsWith('/api/') || open.includes(path)) return;
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const allowedWhileForced = ['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'];
    if (user.mustChangePassword && !allowedWhileForced.includes(path)) return reply.code(403).send({ error: 'password_change_required' });
    if (path.startsWith('/api/admin/') && user.role !== 'admin') return reply.code(403).send({ error: 'forbidden' });
  });

  app.get('/api/health', async () => {
    await db.execute('select 1');
    return { ok: true };
  });

  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie('sid', token, { httpOnly: true, secure: config.secureCookie, sameSite: 'lax', path: '/', maxAge: AUTH.sessionDays * 86400 });

  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ username: z.string().max(100), password: z.string().max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const r = await auth.login(db, body.data.username, body.data.password, req.ip);
    if (!r.ok) return reply.code(r.reason === 'locked' ? 429 : 401).send({ error: r.reason });
    setCookie(reply, r.token);
    return { user: publicUser(r.user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.token) await auth.destroySession(db, req.token);
    return reply.clearCookie('sid', { path: '/' }).send({ ok: true });
  });

  app.get('/api/auth/me', async (req) => ({ user: publicUser(req.user!), avatar: req.user!.avatar }));

  app.post('/api/auth/change-password', async (req, reply) => {
    const body = z.object({ current: z.string(), next: password }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request', message: body.error.issues[0].message });
    const u = req.user!;
    if (!(await auth.verifyPassword(u.passwordHash, body.data.current))) return reply.code(400).send({ error: 'wrong_password' });
    if (body.data.next === body.data.current) return reply.code(400).send({ error: 'same_password' });
    await auth.changePassword(db, u.id, body.data.next, req.token);
    return { ok: true };
  });

  // Read-only current map, for the lobby backdrop shown before joining the office.
  app.get('/api/map', async () => ({ map: (await latestMap(db)).data }));

  app.put('/api/me/avatar', async (req, reply) => {
    const a = avatarSchema.safeParse(req.body);
    if (!a.success) return reply.code(400).send({ error: 'bad_request' });
    await db.update(users).set({ avatar: a.data }).where(eq(users.id, req.user!.id));
    await hub.profileChanged(req.user!.id);
    return { ok: true };
  });

  // A desk owner rearranges furniture inside their own desk area. Applied to the live map in place (no new version).
  app.put('/api/me/desk', async (req, reply) => {
    const body = z.object({ furniture: mapSchema.innerType().shape.furniture }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const cur = await latestMap(db);
    const r = applyDeskEdit(cur.data, req.user!.id, body.data.furniture);
    if ('error' in r) return reply.code(422).send({ error: 'desk_edit_rejected', message: r.error });
    await db.update(mapVersions).set({ data: r.map }).where(eq(mapVersions.version, cur.version));
    hub.mapPublished(r.map, cur.version);
    return { ok: true };
  });

  // --- admin: users ---
  const otherActiveAdmins = async (exceptId: string) =>
    (await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.disabled, false), ne(users.id, exceptId)))).length;

  app.get('/api/admin/users', async () => ({
    users: (await db.select().from(users).orderBy(users.displayName)).map(publicUser),
  }));

  app.post('/api/admin/users', async (req, reply) => {
    const b = z.object({
      username: z.string().transform((s) => s.trim().toLowerCase()).refine((s) => usernameRe.test(s), 'ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - ยาว 3-32 ตัว'),
      password,
      displayName: z.string().trim().min(1).max(80),
      department: z.string().trim().max(80).default(''),
      jobTitle: z.string().trim().max(80).default(''),
      role: z.enum(['admin', 'member']).default('member'),
    }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request', message: b.error.issues[0].message });
    const { password: pw, ...rest } = b.data;
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, rest.username));
    if (dup) return reply.code(409).send({ error: 'username_taken' });
    const [u] = await db.insert(users).values({ ...rest, passwordHash: await auth.hashPassword(pw), mustChangePassword: true }).returning();
    return publicUser(u);
  });

  app.patch<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    const b = z.object({
      displayName: z.string().trim().min(1).max(80).optional(),
      department: z.string().trim().max(80).optional(),
      jobTitle: z.string().trim().max(80).optional(),
      role: z.enum(['admin', 'member']).optional(),
      disabled: z.boolean().optional(),
    }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const [target] = await db.select().from(users).where(eq(users.id, req.params.id));
    if (!target) return reply.code(404).send({ error: 'not_found' });
    const losesAdmin = target.role === 'admin' && !target.disabled && (b.data.role === 'member' || b.data.disabled === true);
    if (losesAdmin && (await otherActiveAdmins(target.id)) === 0) return reply.code(409).send({ error: 'last_admin' });
    const [u] = await db.update(users).set(b.data).where(eq(users.id, target.id)).returning();
    if (b.data.disabled) {
      await auth.destroyUserSessions(db, u.id);
      hub.kick(u.id, 'disabled');
    } else await hub.profileChanged(u.id);
    return publicUser(u);
  });

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/reset-password', async (req, reply) => {
    const b = z.object({ password }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request', message: b.error.issues[0].message });
    const [u] = await db.update(users).set({ passwordHash: await auth.hashPassword(b.data.password), mustChangePassword: true }).where(eq(users.id, req.params.id)).returning();
    if (!u) return reply.code(404).send({ error: 'not_found' });
    await auth.destroyUserSessions(db, u.id);
    hub.kick(u.id, 'password_reset');
    return { ok: true };
  });

  // --- admin: map ---
  app.get('/api/admin/map', async () => {
    const [d] = await db.select().from(mapDraft).where(eq(mapDraft.id, 1));
    const cur = await latestMap(db);
    return { draft: d?.data ?? cur.data, hasDraft: !!d, version: cur.version };
  });

  app.put('/api/admin/map/draft', async (req, reply) => {
    const m = mapSchema.safeParse(req.body);
    if (!m.success) return reply.code(400).send({ error: 'invalid_map', message: m.error.issues[0].message });
    await db.insert(mapDraft).values({ id: 1, data: m.data }).onConflictDoUpdate({ target: mapDraft.id, set: { data: m.data, updatedAt: new Date() } });
    return { ok: true };
  });

  app.delete('/api/admin/map/draft', async () => {
    await db.delete(mapDraft);
    return { ok: true };
  });

  const publish = async (data: MapData, userId: string, note: string) => {
    const [v] = await db.insert(mapVersions).values({ data, createdBy: userId, note }).returning();
    await db.delete(mapDraft);
    hub.mapPublished(data, v.version);
    return v.version;
  };

  app.post('/api/admin/map/publish', async (req, reply) => {
    const m = mapSchema.safeParse(req.body);
    if (!m.success) return reply.code(400).send({ error: 'invalid_map', message: m.error.issues[0].message });
    const errors = validateForPublish(m.data);
    if (errors.length) return reply.code(422).send({ error: 'validation_failed', errors });
    return { version: await publish(m.data, req.user!.id, '') };
  });

  app.get('/api/admin/map/versions', async () => ({
    versions: await db.select({ version: mapVersions.version, note: mapVersions.note, createdAt: mapVersions.createdAt }).from(mapVersions).orderBy(desc(mapVersions.version)),
  }));

  app.get<{ Params: { version: string } }>('/api/admin/map/versions/:version', async (req, reply) => {
    const [row] = await db.select().from(mapVersions).where(eq(mapVersions.version, Number(req.params.version)));
    return row ? row.data : reply.code(404).send({ error: 'not_found' });
  });

  app.post<{ Params: { version: string } }>('/api/admin/map/rollback/:version', async (req, reply) => {
    const [row] = await db.select().from(mapVersions).where(eq(mapVersions.version, Number(req.params.version)));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const errors = validateForPublish(row.data);
    if (errors.length) return reply.code(422).send({ error: 'validation_failed', errors });
    return { version: await publish(row.data, req.user!.id, `ย้อนกลับไปเวอร์ชัน ${row.version}`) };
  });

  return app;
}

export async function latestMap(db: Db) {
  return (await db.select().from(mapVersions).orderBy(desc(mapVersions.version)).limit(1))[0];
}

export type App = Awaited<ReturnType<typeof buildApp>>;
