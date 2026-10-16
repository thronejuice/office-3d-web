import { expect, test, type Browser, type Page } from '@playwright/test';
import { BASE, adminClient, enterOffice, ensureUser, openAs, resetMap, selfPos, walkTo, type Client } from '../helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

let admin: Client;
const users: Record<string, { client: Client; id: string }> = {};
test.beforeAll(async () => {
  admin = await adminClient();
  await resetMap(admin); // the seed map: music zone at x2..10,y11..17; poker tables at (16,13) and (20,14)
  for (const [u, n] of [['alice', 'อลิส'], ['bob', 'บ๊อบ'], ['carol', 'แครอล']]) users[u] = await ensureUser(admin, `e2e-${u}`, n);
});

async function join(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, permissions: ['microphone'] });
  const page = await openAs(ctx, users[name].client);
  await enterOffice(page);
  return page;
}
const st = <T>(p: Page, fn: (s: any) => T) => p.evaluate((src) => new Function('s', `return (${src})(s)`)((window as any).__office3d.state()), fn.toString());

test('music zone: the nature track plays only while standing in the zone, with local controls', async ({ browser, request }) => {
  // the bundled loops are really served
  for (const t of ['rain', 'forest', 'sea', 'stream']) {
    const r = await request.get(`${BASE}/audio/nature/${t}.mp3`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('audio');
    expect((await r.body()).length).toBeGreaterThan(100_000);
  }
  const a = await join(browser, 'alice');
  await expect(a.locator('.musicbar')).toHaveCount(0);
  await walkTo(a, 5.5, 13.5);
  await expect.poll(() => st(a, (s) => s.musicTrack)).toBe('forest');
  await expect(a.locator('.musicbar')).toBeVisible();
  await expect(a.locator('.musicbar')).toContainText('ป่าและเสียงนก');
  // mute and volume are local to this device
  await a.getByRole('button', { name: 'ปิดเพลง' }).click();
  expect(await st(a, (s) => s.musicOff)).toBe(true);
  await a.getByRole('button', { name: 'เปิดเพลง' }).click();
  await a.getByRole('slider', { name: 'ระดับเสียงเพลง' }).fill('0.8');
  expect(await st(a, (s) => s.musicVolume)).toBeCloseTo(0.8, 1);
  // leaving the zone stops it
  await walkTo(a, 13.5, 18.5);
  await expect.poll(() => st(a, (s) => s.musicTrack)).toBe(null);
  await expect(a.locator('.musicbar')).toHaveCount(0);
  await a.context().close();
});

const tableOf = (p: Page) => st(p, (s) => { const f = s.map.furniture.find((x: any) => x.game); return { id: f.id, x: f.x, y: f.y }; });
const viewOf = (p: Page, id: string) => p.evaluate((tid) => JSON.parse(JSON.stringify((window as any).__office3d.state().games[tid]?.view ?? null)), id) as Promise<any>;

/** Click the action button of whoever is to act, until the hand reaches showdown. */
async function playToShowdown(pages: Record<string, Page>, tableId: string) {
  const first = Object.values(pages)[0];
  for (let i = 0; i < 40; i++) {
    const v = await viewOf(first, tableId);
    if (v.phase === 'showdown') return v;
    if (v.toAct >= 0) {
      const actor = v.seats[v.toAct].userId as string;
      const page = pages[actor];
      const turn = v.handNo + ':' + v.phase + ':' + v.toAct;
      await page.getByRole('button', { name: /^(ผ่าน|ตาม)/ }).first().click();
      await expect.poll(async () => { const n = await viewOf(first, tableId); return n.handNo + ':' + n.phase + ':' + n.toAct; }).not.toBe(turn);
    } else await first.waitForTimeout(200);
  }
  throw new Error('hand did not finish');
}

test('poker: two players sit, hole cards stay private, the hand plays out, seated players cannot walk', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const b = await join(browser, 'bob');
  const t = await tableOf(a);
  await walkTo(a, t.x + 1.5, t.y - 1.5); // both on the north side: the south side now borders the bingo table
  await walkTo(b, t.x + 2.5, t.y - 1.5);

  await a.getByRole('button', { name: /^โต๊ะ/ }).click();
  await expect(a.locator('.gamepanel')).toBeVisible();
  await a.getByRole('button', { name: 'นั่งเล่น' }).click();
  await expect.poll(() => st(a, (s) => s.games && Object.values(s.games).some((g: any) => g.view.seats.some((x: any) => x && !x.leaving)))).toBe(true);
  const seatPos = await selfPos(a);
  expect(Math.abs(seatPos.y - (t.y - 0.5))).toBeLessThan(0.01); // on a seat tile just above the table

  await b.getByRole('button', { name: /^โต๊ะ/ }).click();
  await b.getByRole('button', { name: 'นั่งเล่น' }).click();
  await expect.poll(async () => (await viewOf(a, t.id)).phase).toBe('preflop');
  await expect.poll(async () => (await viewOf(b, t.id)).phase).toBe('preflop');

  // privacy: each player sees their own cards and only card backs for the other
  const va = await viewOf(a, t.id), vb = await viewOf(b, t.id);
  const seatOf = (v: any, id: string) => v.seats.find((s: any) => s && s.userId === id);
  expect(seatOf(va, users.alice.id).hole.every((c: number) => c >= 0)).toBe(true);
  expect(seatOf(va, users.bob.id).hole).toEqual([-1, -1]);
  expect(seatOf(vb, users.bob.id).hole.every((c: number) => c >= 0)).toBe(true);
  expect(seatOf(vb, users.alice.id).hole).toEqual([-1, -1]);
  await expect(a.locator('.myhand svg.pcard')).toHaveCount(2);
  await expect(a.locator('.seat:not(.mine) svg.pcard[aria-label="ไพ่คว่ำ"]')).toHaveCount(2);

  // seated: walking is refused by the server
  await a.evaluate(() => (window as any).__office3d.walkTo(13.5, 18.5));
  await a.waitForTimeout(800);
  const still = await selfPos(a);
  expect(Math.hypot(still.x - seatPos.x, still.y - seatPos.y)).toBeLessThan(0.05);

  // play: everyone calls / checks down to showdown; chips are conserved
  const v = await playToShowdown({ [users.alice.id]: a, [users.bob.id]: b }, t.id);
  expect(v.result.won.length).toBeGreaterThan(0);
  expect(v.seats.reduce((n: number, s: any) => n + (s?.chips ?? 0), 0)).toBe(2000);
  await expect(a.locator('.gamepanel .result')).toBeVisible();

  // standing up unlocks movement
  await a.getByRole('button', { name: 'ลุกจากโต๊ะ' }).click();
  await expect.poll(() => st(a, (s) => Object.values(s.games).every((g: any) => g.view.seats.every((x: any) => !x || x.userId !== s.selfId || x.leaving)))).toBe(true);
  await walkTo(a, 13.5, 18.5);

  await a.context().close(); await b.context().close();
});

test('poker: leaving the office mid-hand folds the player and frees the seat; a spectator cannot see hole cards', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const b = await join(browser, 'bob');
  const c = await join(browser, 'carol');
  const t = await tableOf(a);
  await walkTo(a, t.x + 1.5, t.y - 1.5); await walkTo(b, t.x + 2.5, t.y - 1.5); await walkTo(c, t.x - 0.5, t.y - 1.5);
  for (const p of [a, b]) { await p.getByRole('button', { name: /^โต๊ะ/ }).click(); await p.getByRole('button', { name: 'นั่งเล่น' }).click(); }
  await expect.poll(async () => (await viewOf(a, t.id)).phase).toBe('preflop');

  // carol only watches: she sees the table but never a hole card
  await c.getByRole('button', { name: /^โต๊ะ/ }).click();
  await expect(c.locator('.gamepanel')).toBeVisible();
  const vc = await viewOf(c, t.id);
  for (const s of vc.seats) if (s) expect(s.hole.every((x: number) => x < 0)).toBe(true);
  await expect(c.locator('.myhand')).toHaveCount(0);

  await b.context().close(); // bob drops out
  await expect.poll(async () => (await viewOf(a, t.id)).phase).toBe('showdown');
  const v = await viewOf(a, t.id);
  const bob = v.seats.find((s: any) => s && s.userId === users.bob.id);
  expect(!bob || (bob.leaving && bob.folded)).toBe(true); // shown as "left" until the next hand starts
  expect(v.result.won[0].userId).toBe(users.alice.id);
  await a.context().close(); await c.context().close();
});

const chessOf = (p: Page) => st(p, (s) => { const f = s.map.furniture.find((x: any) => x.game === 'chess'); return { id: f.id, x: f.x, y: f.y }; });
const cell = (p: Page, sqName: string) => p.locator(`.board8 [role=gridcell][aria-label^="${sqName} "]`);
async function chessMove(p: Page, from: string, to: string) {
  await cell(p, from).click();
  await cell(p, to).click();
}

test('chess: two players sit facing each other, play scholar\'s mate through the board, then resign and swap colours', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const b = await join(browser, 'bob');
  const t = await chessOf(a);
  await walkTo(a, t.x - 0.5, t.y - 1.5);
  await walkTo(b, t.x - 0.5, t.y + 2.5);
  for (const p of [a, b]) {
    await p.getByRole('button', { name: /^โต๊ะ/ }).click();
    await p.getByRole('button', { name: 'นั่งเล่น' }).click();
  }
  await expect(a.locator('.board8')).toBeVisible();
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('playing');
  // seats are on opposite sides of the table and the black player sees the board from their side
  await expect.poll(async () => (await viewOf(b, t.id)).phase).toBe('playing');
  await expect.poll(async () => (await selfPos(b)).y).toBeGreaterThan(t.y + 1);
  const pa = await selfPos(a), pb = await selfPos(b);
  expect(pa.x).toBeCloseTo(pb.x, 1);
  expect(pb.y - pa.y).toBeGreaterThan(1.5);
  await expect(cell(a, 'a8')).toBeVisible();
  await expect(a.locator('.board8 [role=gridcell]').first()).toHaveAttribute('aria-label', /^a8 /);
  await expect(b.locator('.board8 [role=gridcell]').first()).toHaveAttribute('aria-label', /^h1 /);

  // only the mover can click squares
  await expect(b.locator('.board8 [role=gridcell]').first()).toHaveAttribute('aria-disabled', 'true');

  // scholar's mate
  const turns: [Page, string, string][] = [[a, 'e2', 'e4'], [b, 'e7', 'e5'], [a, 'd1', 'h5'], [b, 'b8', 'c6'], [a, 'f1', 'c4'], [b, 'g8', 'f6'], [a, 'h5', 'f7']];
  for (const [p, f, to] of turns) {
    const mover = p === a ? 'w' : 'b';
    await expect.poll(async () => (await viewOf(a, t.id)).turn).toBe(mover);
    await chessMove(p, f, to);
  }
  await expect.poll(async () => (await viewOf(a, t.id)).phase).toBe('over');
  const v = await viewOf(a, t.id);
  expect(v.result).toMatchObject({ winner: 'w', reason: 'checkmate' });
  await expect(a.locator('.gamepanel .result')).toContainText('รุกฆาต');
  await expect(b.locator('.gamepanel .result')).toContainText('รุกฆาต');

  // the next game starts by itself with colours swapped; bob (now White) resigns after a click-confirm
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('playing');
  expect((await viewOf(a, t.id)).seats.find((s: any) => s.userId === users.alice.id).color).toBe('b');
  await b.getByRole('button', { name: 'ยอมแพ้', exact: true }).click();
  await b.getByRole('button', { name: 'กดอีกครั้งเพื่อยอมแพ้' }).click();
  await expect.poll(async () => (await viewOf(a, t.id)).result?.reason).toBe('resign');
  expect((await viewOf(a, t.id)).result.winner).toBe('b');

  // leaving while the next game runs forfeits it
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('playing');
  await a.getByRole('button', { name: /^ลุก/ }).click();
  await expect.poll(async () => (await viewOf(b, t.id)).result?.reason).toBe('left');
  await a.context().close(); await b.context().close();
});

const unoOf = (p: Page) => st(p, (s) => { const f = s.map.furniture.find((x: any) => x.game === 'uno'); return { id: f.id, x: f.x, y: f.y }; });

test('uno: two players sit, hands stay private, turns alternate through real plays and draws, leaving ends the round', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const b = await join(browser, 'bob');
  const t = await unoOf(a);
  await walkTo(a, t.x + 0.5, t.y + 2.5); // south of the round table, away from the poker tables
  await walkTo(b, t.x + 1.5, t.y + 2.5);
  for (const p of [a, b]) {
    await p.getByRole('button', { name: /^โต๊ะยูโน/ }).click();
    await p.getByRole('button', { name: 'นั่งเล่น' }).click();
  }
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('playing');
  await expect.poll(async () => (await viewOf(b, t.id)).phase, { timeout: 20_000 }).toBe('playing');

  // privacy: your own seven cards, only a count for the other player
  const va = await viewOf(a, t.id), vb = await viewOf(b, t.id);
  expect(va.hand.length).toBe(7);
  expect(vb.hand.length).toBe(7);
  for (const s of vb.seats.filter(Boolean)) expect(Object.keys(s).sort()).toEqual(['count', 'inRound', 'userId']);
  await expect(a.locator('.uno-hand .hand-card')).toHaveCount(7);
  await expect(a.locator('.seat:not(.mine):not(.empty)')).toContainText('7 ใบ');

  // play a dozen real actions through the UI
  const pages: Record<string, Page> = { [users.alice.id]: a, [users.bob.id]: b };
  for (let i = 0; i < 12; i++) {
    const v = await viewOf(a, t.id);
    if (v.phase !== 'playing') break;
    const actor = v.seats[v.turn].userId as string;
    const page = pages[actor];
    await expect.poll(async () => { const m = await viewOf(page, t.id); return m.turn === v.turn && m.handNo === v.handNo && m.last?.seat === v.last?.seat && m.last?.kind === v.last?.kind; }, { timeout: 10_000 }).toBe(true); // the actor's page has caught up
    const mine = await viewOf(page, t.id);
    const sig = (n: any) => `${n.handNo}:${n.turn}:${n.drew}:${n.last?.kind}:${n.last?.seat}:${n.last?.card}:${n.top}:${n.drawCount}:${n.seats.map((s: any) => s?.count).join(',')}`; // a skip or reverse keeps the turn, so look at the whole picture
    const key = sig(mine);
    const ok = page.locator('.uno-hand .hand-card.ok');
    if (await ok.count()) {
      await ok.first().click();
      const colors = page.locator('.promo button');
      if (await colors.count()) await colors.first().click();
    } else if (mine.drew) await page.getByRole('button', { name: /^ผ่าน/ }).click();
    else await page.locator('.pile:not(.static)').click();
    await expect.poll(async () => { const n = await viewOf(a, t.id); return n.phase !== 'playing' || sig(n) !== key; }, { timeout: 10_000 }).toBe(true);
  }
  const after = await viewOf(a, t.id);
  if (after.phase === 'playing') {
    // someone leaving hands the round to the other player
    await a.getByRole('button', { name: 'ลุกจากโต๊ะ' }).click();
    await expect.poll(async () => (await viewOf(b, t.id)).winner).toBe(users.bob.id);
    expect((await viewOf(b, t.id)).reason).toBe('left');
    await expect(b.locator('.gamepanel .result')).toBeVisible();
  }
  await a.context().close(); await b.context().close();
});

const pdOf = (p: Page) => st(p, (s) => { const f = s.map.furniture.find((x: any) => x.game === 'pokdeng'); return { id: f.id, x: f.x, y: f.y }; });

test('pok deng: dealer and punter sit, cards stay hidden, a round is bet, played and settled, then the dealer role moves', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const b = await join(browser, 'bob');
  const t = await pdOf(a);
  await walkTo(a, t.x + 0.5, t.y + 2.5); // south of the round table, clear of the other game tables
  await walkTo(b, t.x + 1.5, t.y + 2.5);
  for (const p of [a, b]) {
    await p.getByRole('button', { name: /^โต๊ะป๊อกเด้ง/ }).click();
    await p.getByRole('button', { name: 'นั่งเล่น' }).click();
  }
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('betting');
  await expect.poll(async () => (await viewOf(b, t.id)).phase, { timeout: 20_000 }).toBe('betting');
  const v0 = await viewOf(a, t.id);
  const dealerId = v0.seats[v0.dealer].userId as string;
  const punter = dealerId === users.alice.id ? b : a;
  const dealerPage = dealerId === users.alice.id ? a : b;
  const punterId = dealerId === users.alice.id ? users.bob.id : users.alice.id;

  // the dealer has no betting buttons; the punter picks 20
  await expect(dealerPage.getByRole('group', { name: 'เลือกเงินเดิมพัน' })).toHaveCount(0);
  await punter.getByRole('group', { name: 'เลือกเงินเดิมพัน' }).getByRole('button', { name: '20', exact: true }).click();
  // cards are dealt: acting, or straight to showdown when somebody was dealt a pok
  await expect.poll(async () => (await viewOf(a, t.id)).phase).not.toBe('betting');
  await expect.poll(async () => (await viewOf(b, t.id)).phase).not.toBe('betting');

  // privacy: you see your own two cards; the other player's are face down unless they have pok
  for (const [p, me, other] of [[a, users.alice.id, users.bob.id], [b, users.bob.id, users.alice.id]] as const) {
    const v = await viewOf(p, t.id);
    const mine = v.seats.find((s: any) => s && s.userId === me), theirs = v.seats.find((s: any) => s && s.userId === other);
    expect(mine.cards.every((c: number) => c >= 0)).toBe(true);
    if (v.phase === 'acting') expect(theirs.cards.every((c: number) => c < 0) || theirs.hand?.startsWith('ป๊อก')).toBe(true);
  }

  // play it out through the buttons: everybody stays
  const pages: Record<string, Page> = { [users.alice.id]: a, [users.bob.id]: b };
  for (let i = 0; i < 4; i++) {
    const v = await viewOf(a, t.id);
    if (v.phase !== 'acting') break;
    const actor = v.seats[v.toAct].userId as string;
    await expect.poll(async () => (await viewOf(pages[actor], t.id)).toAct).toBe(v.toAct);
    await pages[actor].getByRole('button', { name: 'อยู่' }).click();
    await expect.poll(async () => { const n = await viewOf(a, t.id); return n.phase !== 'acting' || n.toAct !== v.toAct; }).toBe(true);
  }
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 15_000 }).toBe('showdown');
  const end = await viewOf(a, t.id);
  expect(end.result.lines.length).toBe(1);
  expect(end.result.lines[0].userId).toBe(punterId);
  expect(end.result.lines[0].bet).toBe(20);
  const sum = end.seats.reduce((n: number, s: any) => n + (s?.chips ?? 0), 0);
  expect(sum).toBe(2000); // chips are conserved
  expect(end.seats.every((s: any) => !s || s.cards.every((c: number) => c >= 0))).toBe(true); // everything face up
  await expect(a.locator('.gamepanel')).toContainText('เจ้ามือ');

  // the next round starts by itself and the dealer role moves to the other player
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('betting');
  const next = await viewOf(a, t.id);
  expect(next.seats[next.dealer].userId).toBe(punterId);
  await a.context().close(); await b.context().close();
});

const bingoOf = (p: Page) => st(p, (s) => { const f = s.map.furniture.find((x: any) => x.game === 'bingo'); return { id: f.id, x: f.x, y: f.y }; });

test('bingo: two players get their own cards, the caller calls numbers for both, tapping marks only called numbers, leaving calls the round off', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const b = await join(browser, 'bob');
  const t = await bingoOf(a);
  await walkTo(a, t.x + 0.5, t.y + 2.5); // south of the round table
  await walkTo(b, t.x + 1.5, t.y + 2.5);
  for (const p of [a, b]) {
    await p.getByRole('button', { name: /^โต๊ะบิงโก/ }).click();
    await p.getByRole('button', { name: 'นั่งเล่น' }).click();
  }
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('playing');
  await expect.poll(async () => (await viewOf(b, t.id)).phase, { timeout: 20_000 }).toBe('playing');

  // each player holds their own 25-square card with a free centre; the other card is never sent
  const va = await viewOf(a, t.id), vb = await viewOf(b, t.id);
  expect(va.card.length).toBe(25);
  expect(vb.card.length).toBe(25);
  expect(va.card).not.toEqual(vb.card);
  expect(va.card[12]).toBe(0);
  await expect(a.locator('.bingo-cell')).toHaveCount(25);
  await expect(a.getByRole('gridcell', { name: 'ช่องฟรี' })).toBeVisible();

  // nothing can be tapped before a number is called, and bingo cannot be claimed
  await expect(a.locator('.bingo-cell:not(:disabled)')).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'บิงโก!' })).toBeDisabled();

  // the caller calls numbers on its own; both players see the same sequence
  await expect.poll(async () => (await viewOf(a, t.id)).called.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const ca = (await viewOf(a, t.id)).called as number[];
  await expect.poll(async () => ((await viewOf(b, t.id)).called as number[]).slice(0, ca.length)).toEqual(ca);
  await expect(a.locator('.ball b')).not.toHaveText('');

  // tap every called number that is on your card: the squares become marked, and nothing else is tappable
  const card = (await viewOf(a, t.id)).card as number[];
  const onCard = ca.filter((n) => card.includes(n));
  for (const n of onCard) {
    const cell = a.locator('.bingo-cell', { hasText: new RegExp(`^${n}$`) });
    await cell.first().click();
  }
  if (onCard.length) await expect.poll(async () => ((await viewOf(a, t.id)).marks as boolean[]).filter(Boolean).length).toBe(onCard.length + 1); // + the free square
  const stillTappable = await a.locator('.bingo-cell:not(:disabled)').count();
  expect(stillTappable).toBe(onCard.length); // marked squares can be tapped again to unmark, nothing else can

  // leaving with only one player left in the round calls it off
  await b.getByRole('button', { name: 'ลุกจากโต๊ะ' }).click();
  await expect.poll(async () => (await viewOf(a, t.id)).phase).toBe('over');
  expect((await viewOf(a, t.id)).reason).toBe('left');
  await expect(a.locator('.gamepanel')).toContainText('ไม่มีผู้ชนะ');
  await a.context().close(); await b.context().close();
});

test('chess keyboard: the board is one tab stop, arrows move inside it, Enter plays, Escape closes the panel', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const b = await join(browser, 'bob');
  const t = await chessOf(a);
  await walkTo(a, t.x - 0.5, t.y - 1.5);
  await walkTo(b, t.x - 0.5, t.y + 2.5);
  for (const p of [a, b]) {
    await p.getByRole('button', { name: /^โต๊ะ/ }).click();
    await p.getByRole('button', { name: 'นั่งเล่น' }).click();
  }
  await expect.poll(async () => (await viewOf(a, t.id)).phase, { timeout: 20_000 }).toBe('playing');
  await expect(a.locator('.board8 [role=gridcell][tabindex="0"]')).toHaveCount(1);
  await expect(b.locator('.board8 [role=gridcell][tabindex="0"]')).toHaveCount(1);
  const start = a.locator('.board8 [role=gridcell][tabindex="0"]');
  await start.focus();
  const before = await start.getAttribute('aria-label');
  await a.keyboard.press('ArrowRight');
  expect(await a.locator('.board8 [role=gridcell]:focus').getAttribute('aria-label')).not.toBe(before);
  await expect(a.locator('.board8 [role=gridcell][tabindex="0"]')).toHaveCount(1);

  await cell(a, 'e2').focus();
  await a.keyboard.press('Enter');
  await expect(cell(a, 'e4')).toHaveAttribute('aria-label', /เดินไปได้/);
  await cell(a, 'e4').focus();
  await a.keyboard.press('Enter');
  await expect.poll(async () => (await viewOf(a, t.id)).history).toEqual(['e2-e4']);

  await a.keyboard.press('Escape');
  await expect(a.locator('.gamepanel')).toHaveCount(0);
  await expect(a.getByRole('button', { name: /^โต๊ะหมากรุก/ })).toBeVisible(); // still seated: reopen from the HUD
  await a.getByRole('button', { name: /^โต๊ะหมากรุก/ }).click();
  await expect(a.locator('.gamepanel.chess')).toBeVisible();
  await a.context().close(); await b.context().close();
});

test('a broken game screen is contained: only the panel is replaced, the office keeps running; a broken page offers a reload', async ({ browser }) => {
  const a = await join(browser, 'alice');
  const t = await tableOf(a);
  await walkTo(a, t.x + 1.5, t.y - 1.5);
  await a.getByRole('button', { name: /^โต๊ะ/ }).click();
  await expect(a.locator('.gamepanel')).toBeVisible();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));
  await a.evaluate((id) => (window as any).__office3d.breakGame(id), t.id);
  await expect(a.getByRole('alert')).toContainText('แผงเกมขัดข้อง');
  await expect(a.locator('.topbar')).toBeVisible(); // the rest of the UI is still there
  await expect(a.locator('canvas')).toBeVisible();
  await a.getByRole('button', { name: 'ปิดแผง' }).click();
  await expect(a.locator('.gamepanel')).toHaveCount(0);
  await walkTo(a, t.x + 2.5, t.y - 1.5); // and the player can still walk

  // an error outside the panel falls back to the page-level notice with a reload button
  await a.evaluate((id) => (window as any).__office3d.breakApp(id), t.id);
  await expect(a.getByRole('alert')).toContainText('หน้าเว็บขัดข้อง');
  await expect(a.getByRole('button', { name: 'โหลดหน้าใหม่' })).toBeVisible();
  await a.getByRole('button', { name: 'โหลดหน้าใหม่' }).click();
  await expect(a.getByRole('button', { name: 'เข้าออฟฟิศ' })).toBeVisible(); // back at the lobby after a reload
  await a.context().close();
});
