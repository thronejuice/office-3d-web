import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BINGO, CHESS, POKDENG, POKER, UNO, createSeedMap, gameTables, sq, tableSeats, type ChessView, type GameState, type BingoView, type PdView, type PokerView, type UnoView, type Seat } from '@office3d/shared';
import { Games, type GameHost } from './games';

const map = createSeedMap();
const table = gameTables(map).find((f) => f.game === 'poker')!;
const chess = gameTables(map).find((f) => f.game === 'chess')!;
const uno = gameTables(map).find((f) => f.game === 'uno')!;
const pd = gameTables(map).find((f) => f.game === 'pokdeng')!;
const bingo = gameTables(map).find((f) => f.game === 'bingo')!;
const seats = tableSeats(map, table);

function setup() {
  const sent: { to: string; g: GameState }[] = [];
  const errors: { to: string; code: string }[] = [];
  const placed: { id: string; seat: Seat }[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  const online = ['a', 'b', 'c'];
  const near = { x: table.x + 1.5, y: table.y + 2.5 }; // just below the table
  for (const u of online) positions.set(u, { ...near });
  const host: GameHost = {
    send: (to, g) => void sent.push({ to, g }),
    error: (to, code) => void errors.push({ to, code }),
    online: () => online,
    pos: (id) => positions.get(id) ?? null,
    place: (id, seat) => { placed.push({ id, seat }); positions.set(id, { x: seat.x, y: seat.y }); },
  };
  const games = new Games(host, () => 0.3);
  games.sync(map);
  const last = (to: string) => [...sent].reverse().find((s) => s.to === to && s.g.tableId === table.id)!.g as GameState & { view: PokerView };
  return { games, sent, errors, placed, positions, last };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('game tables', () => {
  it('creates a table per game table with six seats', () => {
    const { games } = setup();
    expect(games.snapshotFor('a').length).toBe(6);
    expect(seats.length).toBe(6);
  });

  it('seats a nearby player on a seat tile and refuses a far one', () => {
    const { games, errors, placed, positions } = setup();
    positions.set('b', { x: 1.5, y: 1.5 });
    games.sit('b', table.id);
    expect(errors).toContainEqual({ to: 'b', code: 'too_far' });
    games.sit('a', table.id);
    expect(placed[0].id).toBe('a');
    expect(games.isSeated('a')).toBe(true);
    expect(games.seatPos('a')).toEqual(seats[0]);
  });

  it('cannot sit twice and cannot sit at an unknown table', () => {
    const { games, errors } = setup();
    games.sit('a', table.id);
    games.sit('a', table.id);
    games.sit('a', 'nope');
    expect(errors.map((e) => e.code)).toEqual(['already_seated', 'no_table']);
  });

  it('starts a hand automatically with two players and hides the other hole cards', () => {
    const { games, last } = setup();
    games.sit('a', table.id);
    expect(last('a').view!.phase).toBe('waiting');
    games.sit('b', table.id);
    const va = last('a').view!, vb = last('b').view!;
    expect(va.phase).toBe('preflop');
    expect(last('a').deadline).toBeGreaterThan(Date.now());
    const ia = va.seats.findIndex((s) => s?.userId === 'a');
    const ib = va.seats.findIndex((s) => s?.userId === 'b');
    expect(va.seats[ia]!.hole.every((c) => c >= 0)).toBe(true);
    expect(va.seats[ib]!.hole).toEqual([-1, -1]);
    expect(vb.seats[ib]!.hole.every((c) => c >= 0)).toBe(true);
    expect(JSON.stringify(last('c').view)).not.toMatch(/"hole":\[\d/); // a spectator sees no hole cards at all
  });

  it('only the player to act can act', () => {
    const { games, errors, last } = setup();
    games.sit('a', table.id); games.sit('b', table.id);
    const v = last('a').view!;
    const actor = v.seats[v.toAct]!.userId;
    const other = actor === 'a' ? 'b' : 'a';
    games.act(other, { type: 'check' });
    expect(errors).toContainEqual({ to: other, code: 'not_your_turn' });
    games.act(actor, { type: 'call' });
    expect(last('a').view!.seats[last('a').view!.toAct]!.userId).toBe(other);
  });

  it('a turn that runs out folds the player; two in a row stands them up', () => {
    const { games, errors, last } = setup();
    games.sit('a', table.id); games.sit('b', table.id);
    const first = () => { const v = last('a').view!; return v.seats[v.toAct]!.userId; };
    const p1 = first();
    vi.advanceTimersByTime(POKER.turnMs + 10); // p1 folds, heads-up so b wins and the hand ends
    expect(last('a').view!.phase).toBe('showdown');
    vi.advanceTimersByTime(POKER.nextHandMs + 10); // next hand
    expect(last('a').view!.phase).toBe('preflop');
    // the player who must act again is p1 or the other: time out whoever acts until someone stands
    let guard = 0;
    while (games.isSeated('a') && games.isSeated('b') && guard++ < 6) vi.advanceTimersByTime(POKER.turnMs + POKER.nextHandMs + 20);
    expect([games.isSeated('a'), games.isSeated('b')]).toContain(false);
    expect(errors.some((e) => e.code === 'timeout_stand')).toBe(true);
    expect(p1).toBeTruthy();
  });

  it('leaving the office folds and frees the seat', () => {
    const { games, last } = setup();
    games.sit('a', table.id); games.sit('b', table.id);
    games.leave('a');
    expect(games.isSeated('a')).toBe(false);
    expect(last('b').view!.phase).toBe('showdown'); // heads-up: b wins by fold
  });

  it('a spectator joining does not restart the turn clock', () => {
    const { games, last } = setup();
    games.sit('a', table.id); games.sit('b', table.id);
    const d = last('a').deadline;
    vi.advanceTimersByTime(5000);
    games.sit('c', table.id);
    expect(last('a').deadline).toBe(d);
  });

  it('a map without the table closes it and stands everybody up', () => {
    const { games, last } = setup();
    games.sit('a', table.id); games.sit('b', table.id);
    games.sync({ ...map, furniture: map.furniture.filter((f) => f.id !== table.id) });
    expect(games.isSeated('a')).toBe(false);
    expect(last('a').view).toBeNull();
  });
});

describe('chess tables', () => {
  const cseats = tableSeats(map, chess);
  function setupChess() {
    const s = setup();
    for (const u of ['a', 'b', 'c']) s.positions.set(u, { x: chess.x + 0.5, y: chess.y + 2.5 });
    const view = (to: string) => [...s.sent].reverse().find((x) => x.to === to && x.g.tableId === chess.id)!.g.view as ChessView;
    return { ...s, view };
  }
  const S = (n: string) => sq('abcdefgh'.indexOf(n[0]), Number(n[1]) - 1);

  it('has two seats facing each other', () => expect(cseats.length).toBe(2));

  it('seats two players on opposite sides, starts by itself, and only the mover gets legal moves', () => {
    const { games, placed, view } = setupChess();
    games.sit('a', chess.id);
    expect(view('a').phase).toBe('waiting');
    games.sit('b', chess.id);
    expect(placed.map((p) => p.seat)).toEqual([cseats[0], cseats[1]]);
    expect(view('a').phase).toBe('playing');
    expect(Object.keys(view('a').legal).length).toBeGreaterThan(0); // seat 0 plays White first
    expect(Object.keys(view('b').legal).length).toBe(0);
    expect(view('a').seats[0]!.color).toBe('w');
  });

  it('a third player cannot sit', () => {
    const { games, errors } = setupChess();
    games.sit('a', chess.id); games.sit('b', chess.id); games.sit('c', chess.id);
    expect(errors).toContainEqual({ to: 'c', code: 'table_full' });
  });

  it('plays moves, rejects illegal ones, and restarts with swapped colours after the game', () => {
    const { games, errors, view } = setupChess();
    games.sit('a', chess.id); games.sit('b', chess.id);
    games.act('b', { type: 'move', from: S('e7'), to: S('e5') });
    expect(errors).toContainEqual({ to: 'b', code: 'not_your_turn' });
    games.act('a', { type: 'move', from: S('e2'), to: S('e5') });
    expect(errors).toContainEqual({ to: 'a', code: 'illegal_move' });
    games.act('a', { type: 'move', from: S('e2'), to: S('e4') });
    expect(view('b').board[S('e4')]).toBe('P');
    games.act('b', { type: 'resign' });
    expect(view('a').phase).toBe('over');
    expect(view('a').result).toMatchObject({ winner: 'w', reason: 'resign' });
    vi.advanceTimersByTime(CHESS.nextGameMs + 10);
    expect(view('a').phase).toBe('playing');
    expect(view('a').seats[0]!.color).toBe('b'); // colours swapped
  });

  it('leaving forfeits and the remaining player waits for an opponent', () => {
    const { games, view } = setupChess();
    games.sit('a', chess.id); games.sit('b', chess.id);
    games.leave('a');
    expect(games.isSeated('a')).toBe(false);
    expect(view('b').result).toMatchObject({ winner: 'b', reason: 'left' });
    vi.advanceTimersByTime(CHESS.nextGameMs + 10);
    expect(view('b').phase).toBe('waiting');
  });

  it('poker timers do not run on a chess table', () => {
    const { games, view } = setupChess();
    games.sit('a', chess.id); games.sit('b', chess.id);
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(view('a').phase).toBe('playing');
    expect(games.isSeated('a')).toBe(true);
  });
});

describe('uno tables', () => {
  const useats = tableSeats(map, uno);
  function setupUno() {
    const s = setup();
    for (const u of ['a', 'b', 'c']) s.positions.set(u, { x: uno.x + 0.5, y: uno.y - 1.5 });
    const view = (to: string) => [...s.sent].reverse().find((x) => x.to === to && x.g.tableId === uno.id)!.g.view as UnoView;
    return { ...s, view };
  }

  it('has six seats', () => expect(useats.length).toBe(6));

  it('starts with two players, deals privately, and only the player to act can draw', () => {
    const { games, view, errors } = setupUno();
    games.sit('a', uno.id); games.sit('b', uno.id);
    const va = view('a'), vb = view('b');
    expect(va.phase).toBe('playing');
    expect(va.hand.length).toBe(UNO.handSize);
    expect(JSON.stringify(vb)).not.toContain(va.hand[0] + '"'); // b's view never lists a's cards... only counts
    expect(vb.seats.find((s) => s && s.userId === 'a')!.count).toBe(UNO.handSize);
    const actor = va.seats[va.turn]!.userId;
    const other = actor === 'a' ? 'b' : 'a';
    games.act(other, { type: 'draw' });
    expect(errors).toContainEqual({ to: other, code: 'not_your_turn' });
    games.act(actor, { type: 'draw' });
    expect(view(actor).hand.length).toBe(UNO.handSize + 1);
  });

  it('the turn clock passes the turn after a timeout and stands a player up after two', () => {
    const { games, view, errors } = setupUno();
    games.sit('a', uno.id); games.sit('b', uno.id); games.sit('c', uno.id);
    const first = view('a').turn;
    vi.advanceTimersByTime(UNO.turnMs + 10);
    expect(view('a').turn).not.toBe(first);
    let guard = 0;
    while (errors.every((e) => e.code !== 'timeout_stand') && guard++ < 12) vi.advanceTimersByTime(UNO.turnMs + 10);
    expect(errors.some((e) => e.code === 'timeout_stand')).toBe(true);
  });

  it('a spectator joining does not restart the clock; leaving mid-round returns the cards', () => {
    const { games, view, sent } = setupUno();
    games.sit('a', uno.id); games.sit('b', uno.id);
    const deadline = [...sent].reverse().find((s) => s.to === 'a' && s.g.tableId === uno.id)!.g.deadline;
    vi.advanceTimersByTime(4000);
    games.sit('c', uno.id);
    expect([...sent].reverse().find((s) => s.to === 'a' && s.g.tableId === uno.id)!.g.deadline).toBe(deadline);
    const before = view('a').drawCount;
    games.leave('c'); // joined mid-round: no cards, nothing returned
    expect(view('a').drawCount).toBe(before);
    games.leave('a');
    expect(view('b').phase).toBe('over'); // only b left in the round
    expect(view('b').winner).toBe('b');
    vi.advanceTimersByTime(UNO.nextRoundMs + 10);
    expect(view('b').phase).toBe('waiting');
  });
});

describe('pok deng tables', () => {
  function setupPd() {
    const s = setup();
    for (const u of ['a', 'b', 'c']) s.positions.set(u, { x: pd.x + 0.5, y: pd.y - 1.5 });
    const view = (to: string) => [...s.sent].reverse().find((x) => x.to === to && x.g.tableId === pd.id)!.g.view as PdView;
    const deadline = () => [...s.sent].reverse().find((x) => x.g.tableId === pd.id)!.g.deadline;
    return { ...s, view, deadline };
  }

  it('has six seats and starts betting with two players; only punters bet', () => {
    const { games, view, errors } = setupPd();
    expect(tableSeats(map, pd).length).toBe(6);
    games.sit('a', pd.id); games.sit('b', pd.id);
    expect(view('a').phase).toBe('betting');
    expect(view('a').dealer).toBe(0);
    games.act('a', { type: 'bet', amount: 10 });
    expect(errors).toContainEqual({ to: 'a', code: 'dealer_no_bet' });
    games.act('b', { type: 'bet', amount: 20 });
    expect(view('a').phase).toBe('acting');
  });

  it('hides face-down cards from other players and spectators', () => {
    const { games, view } = setupPd();
    games.sit('a', pd.id); games.sit('b', pd.id);
    games.act('b', { type: 'bet', amount: 10 });
    const vb = view('b');
    const mine = vb.seats.find((s) => s && s.userId === 'b')!;
    expect(mine.cards.every((c) => c >= 0)).toBe(true);
    for (const v of [view('c'), view('a')]) {
      const other = v.seats.find((s) => s && s.userId === 'b')!;
      if (v.phase === 'acting' && !other.hand) expect(other.cards).toEqual([-1, -1]);
    }
  });

  it('the betting clock bets the minimum for slow players, and a spectator does not restart it', () => {
    const { games, view, deadline } = setupPd();
    games.sit('a', pd.id); games.sit('b', pd.id);
    const d0 = deadline();
    vi.advanceTimersByTime(3000);
    games.sit('c', pd.id); // joins mid-round
    expect(deadline()).toBe(d0);
    vi.advanceTimersByTime(POKDENG.betMs);
    expect(view('a').phase).not.toBe('betting');
    expect(view('b').seats.find((s) => s && s.userId === 'b')!.bet).toBe(POKDENG.bets[0]);
  });

  it('a round that ends starts the next one by itself with a new dealer', () => {
    const { games, view } = setupPd();
    games.sit('a', pd.id); games.sit('b', pd.id);
    games.act('b', { type: 'bet', amount: 10 });
    let guard = 0;
    while (view('a').phase === 'acting' && guard++ < 6) vi.advanceTimersByTime(POKDENG.actMs + 10);
    expect(view('a').phase).toBe('showdown');
    vi.advanceTimersByTime(POKDENG.nextRoundMs + 10);
    expect(view('a').phase).toBe('betting');
    expect(view('a').dealer).toBe(1);
  });
});

describe('bingo tables', () => {
  function setupBingo() {
    const s = setup();
    for (const u of ['a', 'b', 'c']) s.positions.set(u, { x: bingo.x + 0.5, y: bingo.y + 2.5 });
    const view = (to: string) => [...s.sent].reverse().find((x) => x.to === to && x.g.tableId === bingo.id)!.g.view as BingoView;
    const deadline = () => [...s.sent].reverse().find((x) => x.g.tableId === bingo.id)!.g.deadline;
    return { ...s, view, deadline };
  }

  it('starts with two players, deals private cards, and calls the first number after a pause', () => {
    const { games, view, deadline } = setupBingo();
    expect(tableSeats(map, bingo).length).toBe(6);
    games.sit('a', bingo.id); games.sit('b', bingo.id);
    expect(view('a').phase).toBe('playing');
    expect(view('a').card.length).toBe(25);
    expect(view('c').card).toEqual([]);
    expect(view('a').called).toEqual([]);
    expect(deadline()).toBeGreaterThan(Date.now());
    vi.advanceTimersByTime(BINGO.firstCallMs + 10);
    expect(view('a').called.length).toBe(1);
    vi.advanceTimersByTime(BINGO.callMs * 3 + 10);
    expect(view('b').called.length).toBe(4);
  });

  it('marking and claiming do not restart the caller clock; a false claim is refused', () => {
    const { games, view, errors, deadline } = setupBingo();
    games.sit('a', bingo.id); games.sit('b', bingo.id);
    vi.advanceTimersByTime(BINGO.firstCallMs + 10);
    const d = deadline();
    const n = view('a').called[0];
    games.act('a', { type: 'mark', n });
    games.act('a', { type: 'claim' });
    expect(errors).toContainEqual({ to: 'a', code: 'no_bingo' });
    expect(deadline()).toBe(d);
  });

  it('a player who sits mid-round waits; if everybody dealt in leaves but one the round is called off and the next one deals the waiting player in', () => {
    const { games, view } = setupBingo();
    games.sit('a', bingo.id); games.sit('b', bingo.id); games.sit('c', bingo.id);
    expect(view('c').card).toEqual([]); // joined after the round started
    games.leave('b');
    expect(view('a').phase).toBe('over'); // c was not dealt in, so only a is left in the round: it is called off
    expect(view('a').reason).toBe('left');
    vi.advanceTimersByTime(BINGO.nextRoundMs + 10);
    expect(view('a').phase).toBe('playing'); // a and c are dealt in together
    expect(view('c').card.length).toBe(25);
  });
});
