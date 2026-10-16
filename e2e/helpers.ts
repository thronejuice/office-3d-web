import type { BrowserContext, Page } from '@playwright/test';
import { DEFAULT_AVATAR } from '@office3d/shared';

// These tests reset the map and create users. Refuse to run unless the caller says the target is a throw-away stack
// (`pnpm e2e:isolated` does), so they can never overwrite the office people really use.
if (!process.env.E2E_ALLOW_DESTRUCTIVE) {
  throw new Error('The e2e tests are destructive (they reset the map and create users). Run `pnpm e2e:isolated`, or set E2E_ALLOW_DESTRUCTIVE=1 and BASE_URL to a stack you can throw away.');
}

export const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
export const ADMIN = { username: 'admin', initial: process.env.INITIAL_ADMIN_PASSWORD ?? 'admin-initial-1', final: 'admin-pass-12345' };

export class Client {
  sid = '';
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.sid ? { cookie: `sid=${this.sid}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie')?.match(/sid=([^;]+)/);
    if (set) this.sid = set[1];
    return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
  }
  /** Log in, answering the forced password change when needed. */
  async login(username: string, passwords: string[], final: string) {
    for (const p of passwords) {
      const r = await this.call('POST', '/api/auth/login', { username, password: p });
      if (r.status !== 200) continue;
      if (r.json.user.mustChangePassword) {
        const c = await this.call('POST', '/api/auth/change-password', { current: p, next: final });
        if (c.status !== 200) throw new Error('password change failed');
      }
      return;
    }
    throw new Error(`cannot log in as ${username}`);
  }
}

export async function adminClient() {
  const c = new Client();
  await c.login(ADMIN.username, [process.env.ADMIN_PASSWORD ?? ADMIN.final, ADMIN.final, ADMIN.initial], process.env.ADMIN_PASSWORD ?? ADMIN.final);
  return c;
}

/** Make sure a user exists with a known password and return a logged-in client. */
export async function ensureUser(admin: Client, username: string, displayName: string, opts: { department?: string; role?: 'admin' | 'member' } = {}) {
  const final = 'user-pass-12345';
  const created = await admin.call('POST', '/api/admin/users', { username, password: 'temp-pass-12345', displayName, department: opts.department ?? 'ทดสอบ', jobTitle: 'ผู้ทดสอบ', role: opts.role ?? 'member' });
  const existing = (await admin.call('GET', '/api/admin/users')).json.users.find((u: any) => u.username === username);
  if (existing?.disabled) await admin.call('PATCH', `/api/admin/users/${existing.id}`, { disabled: false });
  const c = new Client();
  await c.login(username, [final, 'temp-pass-12345'], final);
  // make sure the avatar is set so the entry screen goes straight to the enter button
  await c.call('PUT', '/api/me/avatar', DEFAULT_AVATAR);
  const me = (await c.call('GET', '/api/auth/me')).json.user;
  return { client: c, id: me.id as string, created: created.status === 200 };
}

export async function openAs(context: BrowserContext, client: Client): Promise<Page> {
  await context.addCookies([{ name: 'sid', value: client.sid, url: BASE }]);
  const page = await context.newPage();
  await page.goto(BASE + '/');
  return page;
}

export async function enterOffice(page: Page) {
  await page.getByRole('button', { name: 'เข้าออฟฟิศ' }).click();
  await page.waitForFunction(() => (window as any).__office3d?.self && (window as any).__office3d.state().inOffice);
}

export const state = <T>(page: Page, fn: string): Promise<T> => page.evaluate(`(${fn})((window).__office3d)`) as Promise<T>;

export const selfPos = (page: Page) => page.evaluate(() => ({ x: (window as any).__office3d.self.x as number, y: (window as any).__office3d.self.y as number }));
export const voiceInfo = (page: Page) => page.evaluate(() => (window as any).__office3d.voice() as { id: string; state: string; gain: number }[]);

export async function walkTo(page: Page, x: number, y: number) {
  await page.evaluate(([x, y]) => (window as any).__office3d.walkTo(x, y), [x, y]);
  await page.waitForFunction(([x, y]) => Math.hypot((window as any).__office3d.self.x - x, (window as any).__office3d.self.y - y) < 0.7, [x, y], { timeout: 60_000 });
}

/** Publish the seed map so tests start from a known layout. */
export async function resetMap(admin: Client) {
  const { createSeedMap } = await import('@office3d/shared');
  const r = await admin.call('POST', '/api/admin/map/publish', createSeedMap());
  if (r.status !== 200) throw new Error('cannot publish seed map ' + JSON.stringify(r.json));
}
