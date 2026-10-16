import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { AUTH } from '@office3d/shared';
import type { Db } from './db';
import { schema } from './db';

const { users, sessions } = schema;
export type UserRow = typeof users.$inferSelect;

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);
const DUMMY = await argon2.hash('dummy', { type: argon2.argon2id });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// --- failed-login rate limit (in memory: single server instance, resets on restart) ---
const fails = new Map<string, number[]>();
const recent = (key: string, now: number) => {
  const list = (fails.get(key) ?? []).filter((t) => now - t < AUTH.lockWindowMs);
  fails.set(key, list);
  return list;
};
export const isLocked = (username: string, ip: string, now = Date.now()) =>
  recent(`u:${username}`, now).length >= AUTH.maxFailsPerUser || recent(`ip:${ip}`, now).length >= AUTH.maxFailsPerIp;
const recordFail = (username: string, ip: string, now = Date.now()) => {
  recent(`u:${username}`, now).push(now);
  recent(`ip:${ip}`, now).push(now);
};
export const resetLimits = () => fails.clear();

export type LoginResult =
  | { ok: true; token: string; user: UserRow }
  | { ok: false; reason: 'invalid' | 'locked' };

export async function login(db: Db, username: string, password: string, ip: string): Promise<LoginResult> {
  username = username.trim().toLowerCase();
  if (isLocked(username, ip)) return { ok: false, reason: 'locked' };
  const [user] = await db.select().from(users).where(eq(users.username, username));
  // always verify something so timing doesn't reveal whether the user exists
  const good = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword(DUMMY, password), false);
  if (!user || !good || user.disabled) {
    recordFail(username, ip);
    return { ok: false, reason: 'invalid' };
  }
  fails.delete(`u:${username}`);
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    id: sha(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + AUTH.sessionDays * 86_400_000),
  });
  return { ok: true, token, user };
}

/** The user behind a session token, or null if expired / disabled / unknown. */
export async function userForToken(db: Db, token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha(token)), gt(sessions.expiresAt, new Date())));
  return row && !row.user.disabled ? row.user : null;
}

export const destroySession = (db: Db, token: string) => db.delete(sessions).where(eq(sessions.id, sha(token)));
export const destroyUserSessions = (db: Db, userId: string) => db.delete(sessions).where(eq(sessions.userId, userId));
export const purgeExpiredSessions = (db: Db) => db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

export async function changePassword(db: Db, userId: string, newPassword: string, currentToken?: string) {
  await db.update(users).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false }).where(eq(users.id, userId));
  // log out everywhere else
  const all = await db.select().from(sessions).where(eq(sessions.userId, userId));
  for (const s of all) if (!currentToken || s.id !== sha(currentToken)) await db.delete(sessions).where(eq(sessions.id, s.id));
}

export async function bootstrapAdmin(db: Db, username: string, password: string) {
  if (!password) return;
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  if (existing.length) return;
  await db.insert(users).values({
    username: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    displayName: 'ผู้ดูแลระบบ',
    role: 'admin',
    mustChangePassword: true,
  });
  console.log(`Created initial admin "${username}" (must change password on first login)`);
}
