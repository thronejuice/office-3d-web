import { describe, expect, it } from 'vitest';
import { PokDengTable, pdEvaluate, pdValue, type PdAction } from './pokdeng';
import { POKDENG } from './constants';
import type { Card } from './poker';

const R = '23456789TJQKA', S = 'cdhs';
const c = (t: string): Card => S.indexOf(t[1]) * 13 + R.indexOf(t[0]);
const h = (...t: string[]) => t.map(c);

describe('hand values', () => {
  it('counts A as 1 and ten/J/Q/K as 0', () => {
    expect([pdValue(c('As')), pdValue(c('9d')), pdValue(c('Th')), pdValue(c('Kc')), pdValue(c('2c'))]).toEqual([1, 9, 0, 0, 2]);
    expect(pdEvaluate(h('7c', '8d')).points).toBe(5);
    expect(pdEvaluate(h('Ks', 'Jd', '5h')).points).toBe(5);
  });
  it('pok on two cards, with deng for a pair or a suit', () => {
    expect(pdEvaluate(h('4c', '5d'))).toMatchObject({ category: 'pok9', mult: 1 });
    expect(pdEvaluate(h('4c', '5c'))).toMatchObject({ category: 'pok9', mult: 2 });
    expect(pdEvaluate(h('4c', '4d'))).toMatchObject({ category: 'pok8', mult: 2 });
    expect(pdEvaluate(h('7c', '2d')).category).toBe('pok9');
  });
  it('two-card deng without pok, and no pok on three cards', () => {
    expect(pdEvaluate(h('3c', '3d'))).toMatchObject({ category: 'points', points: 6, mult: 2 });
    expect(pdEvaluate(h('3c', '9c'))).toMatchObject({ points: 2, mult: 2 });
    expect(pdEvaluate(h('3c', '3d', '2h'))).toMatchObject({ category: 'points', points: 8, mult: 1 });
    expect(pdEvaluate(h('2c', '3c', '9c'))).toMatchObject({ category: 'points', points: 4, mult: 3 }); // three of one suit
  });
  it('special three-card hands', () => {
    expect(pdEvaluate(h('9c', '9d', '9h'))).toMatchObject({ category: 'threeKind', mult: 5 });
    expect(pdEvaluate(h('4c', '5c', '6c'))).toMatchObject({ category: 'straightFlush', mult: 5 });
    expect(pdEvaluate(h('4c', '5d', '6h'))).toMatchObject({ category: 'straight', mult: 3 });
    expect(pdEvaluate(h('Ac', '2d', '3h')).category).toBe('straight');
    expect(pdEvaluate(h('Qc', 'Kd', 'Ah')).category).toBe('straight');
    expect(pdEvaluate(h('Kc', 'Ad', '2h')).category).toBe('points'); // no wrap-around
    expect(pdEvaluate(h('Jc', 'Qd', 'Kh')).category).toBe('straight'); // J-Q-K is also a run
    expect(pdEvaluate(h('Jc', 'Jd', 'Qh'))).toMatchObject({ category: 'sian', mult: 3 });
    expect(pdEvaluate(h('Kc', 'Kd', 'Kh')).category).toBe('threeKind');
  });
  it('ranks hands: pok 9 > pok 8 > three of a kind > straight flush > straight > sian > points', () => {
    const s = [h('4c', '5d'), h('4c', '4d'), h('9c', '9d', '9h'), h('4c', '5c', '6c'), h('4c', '5d', '6h'), h('Jc', 'Jd', 'Qh'), h('9c', '2d', '7h')].map((x) => pdEvaluate(x).strength);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThan(s[i - 1]);
    expect(pdEvaluate(h('2c', '7d', '9h')).strength).toBeLessThan(pdEvaluate(h('2c', '7d', '8h')).strength + 100); // two ordinary hands compare by points only
    expect(pdEvaluate(h('2c', '7d', '9h')).points).toBe(8);
  });
});

/** A table with a fixed deck: cards are dealt from the end, so list them in reverse deal order. */
function rigged(deal: string[]) {
  const t = new PokDengTable(() => 0.5);
  const orig = t.tryStart.bind(t);
  t.tryStart = () => {
    const r = orig();
    if (r.started) (t as any).deck = Array.from({ length: 52 }, (_, i) => i).filter((x) => !deal.map(c).includes(x)).concat([...deal.map(c)].reverse());
    return r;
  };
  return t;
}
const act = (t: PokDengTable, u: string, a: PdAction) => t.act(u, a);

describe('a round', () => {
  it('needs two players; the dealer is the first seat, then the role passes on', () => {
    const t = new PokDengTable();
    t.sit('a');
    expect(t.tryStart().started).toBe(false);
    t.sit('b'); t.sit('c');
    expect(t.tryStart().started).toBe(true);
    expect(t.dealer).toBe(0);
    expect(t.phase).toBe('betting');
    t.phase = 'showdown';
    t.tryStart();
    expect(t.dealer).toBe(1);
  });

  it('only punters bet, with the allowed amounts; the cards are dealt once everyone has bet', () => {
    const t = new PokDengTable();
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    expect(act(t, 'd', { type: 'bet', amount: 10 })).toBe('dealer_no_bet');
    expect(act(t, 'x', { type: 'bet', amount: 15 })).toBe('bad_amount');
    expect(act(t, 'x', { type: 'bet', amount: 5000 })).toBe('bad_amount');
    expect(act(t, 'x', { type: 'bet', amount: 20 })).toBeNull();
    expect(t.phase).toBe('betting');
    expect(act(t, 'y', { type: 'bet', amount: 50 })).toBeNull();
    expect(t.phase).not.toBe('betting');
    for (const s of t.seats.filter(Boolean)) expect(s!.cards.length).toBe(2);
  });

  it('a dealer pok ends the round at once and the punters cannot draw', () => {
    // deal order: x, y, d (left of the dealer first), twice: x 2c 3d, y 2h 9s, d 4c 5d(pok9)
    const t = rigged(['2c', '2h', '4c', '3d', '9s', '5d']);
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 20 }); act(t, 'y', { type: 'bet', amount: 50 });
    expect(t.phase).toBe('showdown');
    expect(t.result!.dealer.hand).toBe('ป๊อก 9');
    const chips = (u: string) => t.seats[t.seatOf(u)]!.chips;
    expect(chips('x')).toBe(980); // lost 20 (pok 9 pays x1)
    expect(chips('d')).toBe(1000 + 20 + 50);
  });

  it('punters act in seat order, then the dealer; a third card is optional', () => {
    // x 2c 3d (5), y 2h 4s (6), d 5c 6d (1): nobody has pok
    const t = rigged(['2c', '2h', '5c', '3d', '4s', '6d', '9c', '9d', '9h']);
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 10 }); act(t, 'y', { type: 'bet', amount: 10 });
    expect(t.phase).toBe('acting');
    expect(t.seats[t.toAct]!.userId).toBe('x');
    expect(act(t, 'y', { type: 'stay' })).toBe('not_your_turn');
    expect(act(t, 'x', { type: 'draw' })).toBeNull(); // x gets 9c -> 4
    expect(t.seats[1]!.cards.length).toBe(3);
    expect(act(t, 'y', { type: 'stay' })).toBeNull();
    expect(t.seats[t.toAct]!.userId).toBe('d');
    expect(act(t, 'd', { type: 'draw' })).toBeNull(); // d gets 9d -> 0
    expect(t.phase).toBe('showdown');
  });

  it('cannot draw a fourth card; a pok hand skips its turn', () => {
    const t = rigged(['4c', '2h', '3c', '5d', '4s', '6d', '9c', '9d']); // x pok9 (4+5), y 2h 4s=6, d 3c 6d=9 pok
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 10 }); act(t, 'y', { type: 'bet', amount: 10 });
    expect(t.phase).toBe('showdown'); // the dealer has pok 9
  });

  it('settles: winners are paid bet x deng, losers pay, ties are even; chips are conserved', () => {
    // x 7c 8d = 5 (hmm: 15 -> 5), y 9c 9d = pair pok 8 (deng 2), d 3c 4d = 7
    const t = rigged(['7c', '9c', '3c', '8d', '9d', '4d']);
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 10 }); act(t, 'y', { type: 'bet', amount: 20 });
    // y has pok (done), so x acts first
    expect(t.seats[t.toAct]!.userId).toBe('x');
    act(t, 'x', { type: 'stay' });
    act(t, 'd', { type: 'stay' });
    expect(t.phase).toBe('showdown');
    const chips = (u: string) => t.seats[t.seatOf(u)]!.chips;
    expect(chips('x')).toBe(990); // 5 < 7: loses 10
    expect(chips('y')).toBe(1040); // pok 8 with a pair beats 7 and pays x2
    expect(chips('d')).toBe(1000 + 10 - 40);
    expect(chips('d') + chips('x') + chips('y')).toBe(3000);
    expect(t.result!.lines.map((l) => l.outcome)).toEqual(['lose', 'win']);
  });

  it('a tie moves no chips; a loss to a pair pays double', () => {
    // deal x,y,d twice: x 2c 4d = 6, y 2d 3h = 5, d 3c 3s = 6 (a pair: deng 2)
    const t = rigged(['2c', '2d', '3c', '4d', '3h', '3s']);
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 10 }); act(t, 'y', { type: 'bet', amount: 10 });
    act(t, 'x', { type: 'stay' }); act(t, 'y', { type: 'stay' }); act(t, 'd', { type: 'stay' });
    const chips = (u: string) => t.seats[t.seatOf(u)]!.chips;
    expect(t.result!.lines.map((l) => l.outcome)).toEqual(['tie', 'lose']);
    expect([chips('x'), chips('y'), chips('d')]).toEqual([1000, 980, 1020]);
  });

  it('the dealer pays winners only as far as their chips go', () => {
    const t = rigged(['9c', '9d', '2c', '9h', '8d', '3d']);
    t.sit('d'); t.sit('x'); t.sit('y');
    t.seats[0]!.chips = 30;
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 100 }); act(t, 'y', { type: 'bet', amount: 100 });
    while (t.phase === 'acting') act(t, t.seats[t.toAct]!.userId, { type: 'stay' });
    expect(t.seats[0]!.chips).toBe(0);
    expect(t.seats[1]!.chips + t.seats[2]!.chips + t.seats[0]!.chips).toBe(30 + 2000);
  });

  it('a timeout while betting bets the minimum; a second timeout in a row stands the player up', () => {
    const t = rigged(['2c', '2h', '5c', '3d', '4s', '6d']); // nobody has pok
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    const r = t.timeout();
    expect(r.timedOut.sort()).toEqual(['x', 'y']);
    expect(t.phase).toBe('acting');
    expect(t.seats[1]!.bet).toBe(POKDENG.bets[0]);
    const r2 = t.timeout(); // x does not act either: second timeout in a row
    expect(r2).toEqual({ timedOut: ['x'], stood: ['x'] });
    expect(t.seatOf('x')).toBe(-1);
    expect(t.seats[0]!.chips).toBe(1000 + POKDENG.bets[0]); // x's bet went to the dealer
    expect(t.phase).toBe('acting');
  });

  it('a punter who leaves forfeits the bet to the dealer; a dealer who leaves cancels the round', () => {
    const t = new PokDengTable();
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 50 });
    t.stand('x');
    expect(t.seats[0]!.chips).toBe(1050);
    const u = new PokDengTable();
    u.sit('d'); u.sit('x');
    u.tryStart();
    u.stand('d');
    expect(u.phase).toBe('waiting');
    expect(u.seats[u.seatOf('x')]!.cards).toEqual([]);
  });

  it('hides face-down cards from everybody but shows your own, a pok, and everything at showdown', () => {
    const t = rigged(['2c', '9h', '4c', '3d', '8s', '5d']); // x 2c 3d (5), y 9h 8s (7), d 4c 5d (pok 9)
    t.sit('d'); t.sit('x'); t.sit('y');
    t.tryStart();
    act(t, 'x', { type: 'bet', amount: 10 }); act(t, 'y', { type: 'bet', amount: 10 });
    // dealer pok -> showdown: everything is face up
    const v = t.view('spectator');
    expect(v.seats.every((s) => !s || s.cards.every((x) => x >= 0))).toBe(true);
    const u = rigged(['2c', '9h', '3c', '3d', '8s', '4d']); // nobody has pok
    u.sit('d'); u.sit('x'); u.sit('y');
    u.tryStart();
    act(u, 'x', { type: 'bet', amount: 10 }); act(u, 'y', { type: 'bet', amount: 10 });
    const mine = u.view('x'), other = u.view('y'), watcher = u.view('nobody');
    expect(mine.seats[1]!.cards.every((x) => x >= 0)).toBe(true);
    expect(mine.seats[2]!.cards).toEqual([-1, -1]);
    expect(other.seats[1]!.cards).toEqual([-1, -1]);
    expect(watcher.seats.every((s) => !s || s.cards.every((x) => x === -1))).toBe(true);
  });
});
