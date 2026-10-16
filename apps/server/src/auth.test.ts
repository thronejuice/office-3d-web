import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createSeedMap } from '@office3d/shared';
import { schema, migrationsFolder, type Db } from './db';
import { buildApp, type App } from './app';
import { bootstrapAdmin, hashPassword, resetLimits, verifyPassword } from './auth';
import { nullHub, type Hub } from './hub';

process.env.NODE_ENV = 'test';
let db: Db, app: App;
const kicks: string[] = [];
const hub: Hub = { ...nullHub, kick: (id) => void kicks.push(id) };

beforeAll(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder });
  db = pg as unknown as Db;
  await db.insert(schema.mapVersions).values({ data: createSeedMap() });
  await bootstrapAdmin(db, 'admin', 'initial-pass-1');
  app = await buildApp(db, { secureCookie: false }, hub);
});
beforeEach(() => resetLimits());

const post = (url: string, payload: unknown, cookie?: string) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers: cookie ? { cookie } : {} });
const sid = (r: { cookies: { name: string; value: string }[] }) => `sid=${r.cookies.find((c) => c.name === 'sid')!.value}`;
const login = async (u: string, p: string) => { const r = await post('/api/auth/login', { username: u, password: p }); return { r, cookie: r.statusCode === 200 ? sid(r) : '' }; };

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const h = await hashPassword('secret-pass');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'secret-pass')).toBe(true);
    expect(await verifyPassword(h, 'nope')).toBe(false);
  });
});

describe('forced password change', () => {
  it('blocks everything but change-password until changed', async () => {
    const { r, cookie } = await login('admin', 'initial-pass-1');
    expect(r.statusCode).toBe(200);
    expect(r.cookies[0].httpOnly).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } })).statusCode).toBe(403);
    expect((await post('/api/auth/change-password', { current: 'initial-pass-1', next: 'brand-new-pass' }, cookie)).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } })).statusCode).toBe(200);
  });
  it('is forced again after an admin reset, and reset ends sessions', async () => {
    const { cookie: admin } = await login('admin', 'brand-new-pass');
    const created = await post('/api/admin/users', { username: 'Somchai', password: 'temp-pass-1', displayName: 'สมชาย' }, admin);
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    const { cookie: user } = await login('somchai', 'temp-pass-1');
    expect((await app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie: user } })).statusCode).toBe(403);
    await post('/api/auth/change-password', { current: 'temp-pass-1', next: 'somchai-pass-2' }, user);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: user } })).json().user.mustChangePassword).toBe(false);
    await post(`/api/admin/users/${id}/reset-password`, { password: 'reset-pass-3' }, admin);
    expect(kicks).toContain(id);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: user } })).statusCode).toBe(401);
    const again = await login('somchai', 'reset-pass-3');
    expect((await app.inject({ method: 'GET', url: '/api/map', headers: { cookie: again.cookie } })).statusCode).not.toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/admin/map', headers: { cookie: again.cookie } })).statusCode).toBe(403);
  });
});

describe('disabled users', () => {
  it('ends sessions, kicks, and cannot log in', async () => {
    const { cookie: admin } = await login('admin', 'brand-new-pass');
    const id = (await post('/api/admin/users', { username: 'victim', password: 'victim-pass1', displayName: 'V' }, admin)).json().id;
    const { cookie } = await login('victim', 'victim-pass1');
    kicks.length = 0;
    const r = await app.inject({ method: 'PATCH', url: `/api/admin/users/${id}`, payload: { disabled: true }, headers: { cookie: admin } });
    expect(r.statusCode).toBe(200);
    expect(kicks).toEqual([id]);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
    expect((await login('victim', 'victim-pass1')).r.statusCode).toBe(401);
  });
});

describe('admin rules', () => {
  it('last active admin cannot be demoted or disabled', async () => {
    const { cookie: admin } = await login('admin', 'brand-new-pass');
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: admin } })).json().user.id;
    for (const payload of [{ role: 'member' }, { disabled: true }]) {
      const r = await app.inject({ method: 'PATCH', url: `/api/admin/users/${me}`, payload, headers: { cookie: admin } });
      expect(r.statusCode).toBe(409);
    }
    const second = (await post('/api/admin/users', { username: 'admin2', password: 'admin2-pass1', displayName: 'A2', role: 'admin' }, admin)).json().id;
    expect((await app.inject({ method: 'PATCH', url: `/api/admin/users/${me}`, payload: { role: 'member' }, headers: { cookie: admin } })).statusCode).toBe(200);
    expect(second).toBeTruthy();
  });
});

describe('login rate limit', () => {
  it('locks a username after repeated failures', async () => {
    for (let i = 0; i < 5; i++) expect((await login('nobody', 'x')).r.statusCode).toBe(401);
    expect((await login('nobody', 'x')).r.statusCode).toBe(429);
  });
});
