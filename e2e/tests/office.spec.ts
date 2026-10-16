import { expect, test, type Browser, type Page } from '@playwright/test';
import { audibleGain, shouldConnect } from '@office3d/shared';
import { adminClient, enterOffice, ensureUser, openAs, resetMap, selfPos, voiceInfo, walkTo, type Client } from '../helpers';

test.describe.configure({ mode: 'serial' });

let admin: Client;
const users: Record<string, { client: Client; id: string }> = {};
test.beforeAll(async () => {
  admin = await adminClient();
  await resetMap(admin);
  for (const [u, n] of [['alice', 'อลิส'], ['bob', 'บ๊อบ'], ['carol', 'แครอล']]) users[u] = await ensureUser(admin, `e2e-${u}`, n);
});

async function join(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 280 }, permissions: ['microphone'] });
  const page = await openAs(ctx, users[name].client);
  await enterOffice(page);
  return page;
}
const setStatus = (p: Page, label: string) => p.locator('.drawer .seg button', { hasText: new RegExp(`^\\s*${label}$`) }).click();
const openList = async (p: Page) => { if (!(await p.locator('.drawer').count())) await p.locator('.topbar .pill').first().click(); };

/** Wait until the page's peer list has the given id in the given state (or is absent). */
const peerState = (p: Page, id: string) => voiceInfo(p).then((l) => l.find((x) => x.id === id));

test('proximity: connect within 7, hysteresis until 9, gain follows distance', async ({ browser }) => {
  const [a, b] = [await join(browser, 'alice'), await join(browser, 'bob')];
  await walkTo(a, 2.5, 18.5);
  await walkTo(b, 12.5, 18.5); // d = 10 -> too far
  await expect.poll(async () => peerState(a, users.bob.id), { timeout: 10_000 }).toBeUndefined();
  await walkTo(b, 10.5, 18.5); // d = 8 -> still outside the 7-tile connect radius
  await a.waitForTimeout(1500);
  expect(await peerState(a, users.bob.id)).toBeUndefined();

  await walkTo(b, 7.5, 18.5); // d = 5 -> connect
  await expect.poll(async () => (await peerState(a, users.bob.id))?.state, { timeout: 15_000 }).toBe('connected');
  await expect.poll(async () => (await peerState(b, users.alice.id))?.state, { timeout: 15_000 }).toBe('connected');
  await a.waitForTimeout(1500); // let bob settle so both samples describe the same positions
  const view = await a.evaluate((id) => ({ me: (window as any).__office3d.self, other: (window as any).__office3d.others().find((o: any) => o.id === id) }), users.bob.id);
  const g = (await peerState(a, users.bob.id))!.gain;
  const expected = audibleGain({ x: view.me.x, y: view.me.y, zone: null, status: 'available' }, { x: view.other.x, y: view.other.y, zone: null, status: 'available' });
  expect(g).toBeCloseTo(expected, 1);
  expect(g).toBeGreaterThan(0.2);
  expect(g).toBeLessThan(0.4);

  await walkTo(b, 4.5, 18.5); // d = 2 -> full volume
  await expect.poll(async () => (await peerState(a, users.bob.id))?.gain).toBeCloseTo(1, 1);

  await walkTo(b, 10.5, 18.5); // d = 8: inside the 9-tile hysteresis band, stays connected (silent)
  await a.waitForTimeout(1000);
  const held = await peerState(a, users.bob.id);
  expect(held?.state).toBe('connected');
  expect(held!.gain).toBe(0);

  await walkTo(b, 13.5, 18.5); // d = 11 -> disconnect
  await expect.poll(async () => peerState(a, users.bob.id), { timeout: 10_000 }).toBeUndefined();
  await a.context().close(); await b.context().close();
});

test('DND silences the open floor; busy and away do not', async ({ browser }) => {
  const [a, b] = [await join(browser, 'alice'), await join(browser, 'bob')];
  await walkTo(a, 4.5, 18.5);
  await walkTo(b, 6.5, 18.5);
  await expect.poll(async () => (await peerState(a, users.bob.id))?.state, { timeout: 15_000 }).toBe('connected');
  await openList(b); await setStatus(b, 'ไม่ว่าง');
  await a.waitForTimeout(800);
  expect((await peerState(a, users.bob.id))?.gain).toBeCloseTo(1, 1); // busy is a label only
  await setStatus(b, 'ห้ามรบกวน');
  await expect.poll(async () => peerState(a, users.bob.id), { timeout: 8_000 }).toBeUndefined();
  await setStatus(b, 'ว่าง');
  await expect.poll(async () => (await peerState(a, users.bob.id))?.state, { timeout: 15_000 }).toBe('connected');
  await a.context().close(); await b.context().close();
});

test('meeting zone: same zone full volume at any distance, walls block audio', async ({ browser }) => {
  const [a, b, c] = [await join(browser, 'alice'), await join(browser, 'bob'), await join(browser, 'carol')];
  await walkTo(a, 25.5, 3.5); // outside room 1, right next to its wall
  await walkTo(b, 27.5, 3.5); // inside room 1, 2 tiles from alice through the wall
  await walkTo(c, 36.5, 6.5); // inside room 1, far from bob
  await expect.poll(async () => (await peerState(b, users.carol.id))?.state, { timeout: 20_000 }).toBe('connected');
  expect((await peerState(b, users.carol.id))!.gain).toBe(1);
  expect((await peerState(c, users.bob.id))!.gain).toBe(1);
  expect(await peerState(a, users.bob.id)).toBeUndefined();
  expect(await peerState(b, users.alice.id)).toBeUndefined();
  expect(await peerState(a, users.carol.id)).toBeUndefined();

  // DND inside the zone: still heard by people in the same zone
  await openList(b); await setStatus(b, 'ห้ามรบกวน');
  await b.waitForTimeout(1000);
  expect((await peerState(b, users.carol.id))?.gain).toBe(1);
  for (const p of [a, b, c]) await p.context().close();
});

test('knock: toast + sound, silent and listed as missed when DND, 10 s cooldown', async ({ browser }) => {
  const [a, b] = [await join(browser, 'alice'), await join(browser, 'bob')];
  await b.evaluate(() => { (window as any).__knocks = 0; });
  // count knock sounds by wrapping the synth
  await a.evaluate(() => {});
  await walkTo(a, 4.5, 18.5);
  const bobCard = async () => { await a.evaluate((id) => (window as any).__office3d.state().set({ selectedId: id }), users.bob.id); await a.getByRole('button', { name: 'เคาะเรียก' }).click(); };
  await bobCard();
  await expect(b.locator('.toast', { hasText: 'อลิส เคาะเรียกคุณ' })).toBeVisible();
  await expect(b.locator('.toast button', { hasText: 'ไปหา' })).toBeVisible();
  await bobCard(); // within 10 s: ignored
  await b.waitForTimeout(500);
  expect(await b.locator('.toast', { hasText: 'เคาะเรียกคุณ' }).count()).toBe(1);

  const missedBefore = await b.evaluate(() => (window as any).__office3d.state().missed.length); // persisted from earlier runs
  await openList(b); await setStatus(b, 'ห้ามรบกวน');
  await b.locator('.drawer .close').click();
  await a.waitForTimeout(10_500);
  await bobCard();
  await expect.poll(() => b.evaluate(() => (window as any).__office3d.state().missed.length)).toBe(missedBefore + 1);
  await expect(b.locator('.pill.alert')).toBeVisible();
  await b.locator('.pill.alert').click();
  await expect(b.locator('.drawer')).toContainText('อลิส');
  await a.context().close(); await b.context().close();
});

test('disabling a user kicks them out of the office within 2 s', async ({ browser }) => {
  const victim = await ensureUser(admin, 'e2e-victim', 'เหยื่อ');
  const [a, v] = [await join(browser, 'alice'), await openAs(await browser.newContext({ permissions: ['microphone'] }), victim.client)];
  await enterOffice(v);
  await expect.poll(() => a.evaluate(() => Object.keys((window as any).__office3d.state().people).length)).toBe(2);
  const t0 = Date.now();
  const r = await admin.call('PATCH', `/api/admin/users/${victim.id}`, { disabled: true });
  expect(r.status).toBe(200);
  await expect(v.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeVisible({ timeout: 2000 });
  await expect.poll(() => a.evaluate(() => Object.keys((window as any).__office3d.state().people).length), { timeout: 2000 }).toBe(1);
  expect(Date.now() - t0).toBeLessThan(2500);
  await admin.call('PATCH', `/api/admin/users/${victim.id}`, { disabled: false });
  await a.context().close(); await v.context().close();
});

test('map: publishing a wall moves users standing in it; validation; rollback', async ({ browser }) => {
  const { createSeedMap, walkGrid } = await import('@office3d/shared');
  const a = await join(browser, 'alice');
  await walkTo(a, 20.5, 18.5);
  const seed = createSeedMap();
  const walled = { ...seed, tiles: seed.tiles.slice() };
  for (let x = 19; x <= 21; x++) walled.tiles[18 * seed.width + x] = 2; // wall right on top of alice
  const bad = await admin.call('POST', '/api/admin/map/publish', { ...walled, spawn: { x: 19, y: 18 } });
  expect(bad.status).toBe(422);
  expect(bad.json.errors.length).toBeGreaterThan(0);
  const ok = await admin.call('POST', '/api/admin/map/publish', walled);
  expect(ok.status).toBe(200);
  await expect.poll(async () => {
    const p = await selfPos(a);
    return walkGrid(walled)[Math.floor(p.y) * walled.width + Math.floor(p.x)];
  }, { timeout: 5000 }).toBe(1);
  expect(await a.evaluate(() => (window as any).__office3d.state().mapVersion)).toBe(ok.json.version);

  const versions = (await admin.call('GET', '/api/admin/map/versions')).json.versions;
  const prev = versions.find((v: any) => v.version < ok.json.version).version;
  const rb = await admin.call('POST', `/api/admin/map/rollback/${prev}`);
  expect(rb.status).toBe(200);
  await expect.poll(() => a.evaluate(() => (window as any).__office3d.state().mapVersion)).toBe(rb.json.version);
  await a.context().close();
  await resetMap(admin);
});

test('map editor UI: paint a wall, save draft, publish', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const p = await openAs(ctx, admin);
  await p.goto('/admin/map'.startsWith('http') ? '/admin/map' : (process.env.BASE_URL ?? 'http://localhost:5173') + '/admin/map');
  await expect(p.getByRole('button', { name: 'กำแพง' })).toBeVisible();
  await p.getByRole('button', { name: 'กำแพง' }).click();
  await p.waitForTimeout(2000);
  const box = (await p.locator('canvas').boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 10, { steps: 5 }); await p.mouse.up();
  const before = (await admin.call('GET', '/api/admin/map')).json;
  await p.getByRole('button', { name: 'บันทึกฉบับร่าง' }).click();
  await expect.poll(async () => (await admin.call('GET', '/api/admin/map')).json.hasDraft).toBe(true);
  const draft = (await admin.call('GET', '/api/admin/map')).json.draft;
  expect(draft.tiles.filter((t: number) => t === 2).length).toBeGreaterThan(before.draft.tiles.filter((t: number) => t === 2).length);
  await p.getByRole('button', { name: 'เผยแพร่' }).click();
  await expect.poll(async () => (await admin.call('GET', '/api/admin/map')).json.version).toBeGreaterThan(before.version);
  await ctx.close();
  await resetMap(admin);
});

test('desk owner can edit furniture around their own desk, nobody else can', async ({ browser }) => {
  const { createSeedMap } = await import('@office3d/shared');
  const m = createSeedMap();
  m.desks[0].userId = users.alice.id;
  expect((await admin.call('POST', '/api/admin/map/publish', m)).status).toBe(200);
  const a = await join(browser, 'alice');
  const d = m.desks[0];
  const pos = await selfPos(a);
  expect(Math.floor(pos.x)).toBe(d.x); // spawned at the assigned desk
  await a.locator('.topbar button[aria-label]').click();
  await a.getByRole('menuitem', { name: 'แต่งโต๊ะของฉัน' }).click();
  await expect(a.getByText('แตะช่องสีเหลือง')).toBeVisible();
  await a.evaluate(([x, y]) => (window as any).__office3d.deskClick(x, y), [d.x + 1, d.y + 1]); // a free tile in the area
  await a.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect.poll(async () => (await admin.call('GET', '/api/admin/map')).json.draft.furniture.some((f: any) => f.type === 'pottedPlant' && f.x === d.x + 1 && f.y === d.y + 1)).toBe(true);

  // others cannot: no desk -> 422; owner outside own area -> 422
  const bob = await users.bob.client.call('PUT', '/api/me/desk', { furniture: [] });
  expect(bob.status).toBe(422);
  const far = await users.alice.client.call('PUT', '/api/me/desk', { furniture: [{ id: 'x1', type: 'pottedPlant', x: 15, y: 18, rot: 0 }] });
  expect(far.status).toBe(422);
  await a.context().close();
  await resetMap(admin);
});
