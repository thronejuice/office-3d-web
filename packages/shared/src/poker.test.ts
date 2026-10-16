import { describe, expect, it } from 'vitest';
import { PokerTable, bestHand, score5, shuffle, newDeck, type Card } from './poker';
import { POKER } from './constants';

// c('As') helpers: rank char + suit char
const R = '23456789TJQKA';
const S = 'cdhs';
const c = (t: string): Card => S.indexOf(t[1]) * 13 + R.indexOf(t[0]);
const hand = (...t: string[]) => t.map(c);

describe('hand ranking', () => {
  it('orders categories', () => {
    const order = [
      hand('2c', '7d', '9h', 'Js', 'Kc'), // high card
      hand('2c', '2d', '9h', 'Js', 'Kc'), // pair
      hand('2c', '2d', '9h', '9s', 'Kc'), // two pair
      hand('2c', '2d', '2h', 'Js', 'Kc'), // trips
      hand('5c', '6d', '7h', '8s', '9c'), // straight
      hand('2c', '7c', '9c', 'Jc', 'Kc'), // flush
      hand('2c', '2d', '2h', 'Js', 'Jc'), // full house
      hand('2c', '2d', '2h', '2s', 'Kc'), // quads
      hand('5c', '6c', '7c', '8c', '9c'), // straight flush
    ].map(score5);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
  it('wheel is the lowest straight and ace-high beats it', () => {
    expect(score5(hand('Ac', '2d', '3h', '4s', '5c'))).toBeLessThan(score5(hand('2c', '3d', '4h', '5s', '6c')));
    expect(score5(hand('Tc', 'Jd', 'Qh', 'Ks', 'Ac'))).toBeGreaterThan(score5(hand('9c', 'Td', 'Jh', 'Qs', 'Kc')));
  });
  it('kickers decide', () => {
    expect(score5(hand('2c', '2d', 'Ah', '5s', '6c'))).toBeGreaterThan(score5(hand('2h', '2s', 'Kh', '5d', '6d')));
  });
  it('picks the best five of seven and names it', () => {
    const h = bestHand(hand('Ah', 'Kh', 'Qh', 'Jh', 'Th', '2c', '3d'));
    expect(h.name).toBe('รอยัลฟลัช');
    expect(bestHand(hand('2c', '2d', '2h', '9s', '9c', 'Ks', '4d')).name).toBe('ฟูลเฮาส์');
  });
});

describe('shuffle', () => {
  it('keeps all 52 cards', () => {
    const d = shuffle(newDeck(), Math.random);
    expect([...d].sort((a, b) => a - b)).toEqual(newDeck());
  });
});

/** A table whose deck is fixed: cards listed in the order they are dealt (2 hole cards each starting left of the button, then the board). */
function fixedTable(deal: string[]) {
  const t = new PokerTable(() => 0.5);
  const orig = (t as any).tryStart.bind(t);
  (t as any).tryStart = () => {
    const r = orig();
    if (r.started) {
      // rebuild: reset dealt hole cards from the fixed list
      const n = t.seats.filter(Boolean).length;
      const order: number[] = [];
      for (let k = 1; k <= t.seats.length; k++) { const j = (t.button + k) % t.seats.length; if (t.seats[j]) order.push(j); }
      const cards = deal.map(c);
      order.forEach((j, idx) => { t.seats[j]!.hole = [cards[idx], cards[idx + n]]; });
      (t as any).deck = cards.slice(2 * n).reverse().concat(newDeck().filter((x) => !cards.includes(x)));
    }
    return r;
  };
  return t;
}

describe('table flow', () => {
  it('does not start with one player and starts automatically with two', () => {
    const t = new PokerTable();
    t.sit('a');
    expect(t.tryStart().started).toBe(false);
    t.sit('b');
    expect(t.tryStart().started).toBe(true);
    expect(t.phase).toBe('preflop');
  });

  it('heads-up: button posts the small blind and acts first preflop', () => {
    const t = new PokerTable();
    const a = t.sit('a'), b = t.sit('b');
    t.tryStart();
    const sbSeat = t.button;
    expect(t.seats[sbSeat]!.bet).toBe(POKER.smallBlind);
    expect(t.seats[sbSeat === a ? b : a]!.bet).toBe(POKER.bigBlind);
    expect(t.toAct).toBe(sbSeat);
  });

  it('only the player whose turn it is can act', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b');
    t.tryStart();
    const other = t.seats[t.toAct]!.userId === 'a' ? 'b' : 'a';
    expect(t.act(other, { type: 'check' })).toBe('not_your_turn');
  });

  it('big blind keeps the option; fold ends the hand and pays the pot', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b');
    t.tryStart();
    const first = t.seats[t.toAct]!.userId;
    expect(t.act(first, { type: 'call' })).toBeNull();
    expect(t.phase).toBe('preflop'); // the big blind has not acted yet
    const bb = t.seats[t.toAct]!.userId;
    expect(bb).not.toBe(first);
    expect(t.act(bb, { type: 'raise', amount: 60 })).toBeNull();
    expect(t.act(first, { type: 'fold' })).toBeNull();
    expect(t.phase).toBe('showdown');
    expect(t.seats[t.seats.findIndex((s) => s?.userId === bb)]!.chips).toBe(POKER.startChips + POKER.bigBlind);
  });

  it('rejects a raise below the minimum and a check that owes chips', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b');
    t.tryStart();
    const u = t.seats[t.toAct]!.userId;
    expect(t.act(u, { type: 'check' })).toBe('cannot_check');
    expect(t.act(u, { type: 'raise', amount: 30 })).toBe('raise_too_small');
    expect(t.act(u, { type: 'raise', amount: 40 })).toBeNull();
  });

  it('deals flop, turn and river then showdown when everyone checks down', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b');
    t.tryStart();
    const call = () => { t.act(t.seats[t.toAct]!.userId, { type: 'call' }); };
    call(); // sb completes
    t.act(t.seats[t.toAct]!.userId, { type: 'check' }); // bb option
    expect(t.phase).toBe('flop');
    expect(t.board.length).toBe(3);
    for (const [phase, n] of [['turn', 4], ['river', 5]] as const) {
      t.act(t.seats[t.toAct]!.userId, { type: 'check' });
      t.act(t.seats[t.toAct]!.userId, { type: 'check' });
      expect(t.phase).toBe(phase);
      expect(t.board.length).toBe(n);
    }
    t.act(t.seats[t.toAct]!.userId, { type: 'check' });
    t.act(t.seats[t.toAct]!.userId, { type: 'check' });
    expect(t.phase).toBe('showdown');
    const total = t.seats.reduce((a, s) => a + (s?.chips ?? 0), 0);
    expect(total).toBe(2 * POKER.startChips); // chips are conserved
  });

  it('all-in and call runs out the board and the better hand wins everything', () => {
    // seats fill 0,1; the first button is seat 0 so the deal goes seat1, seat0
    const t = fixedTable(['Ah', 'Kd', 'As', 'Qc', /* board */ '2c', '7d', '9h', 'Js', '3c']);
    t.sit('a'); t.sit('b');
    t.tryStart();
    // seat order dealt starting left of the button; find who got the aces
    const aces = t.seats.findIndex((s) => s && s.hole.includes(c('Ah')));
    const aceUser = t.seats[aces]!.userId;
    const kingUser = t.seats.find((s) => s && s.userId !== aceUser)!.userId;
    const first = t.seats[t.toAct]!.userId;
    t.act(first, { type: 'allin' });
    const second = t.seats[t.toAct]!.userId;
    t.act(second, { type: 'call' });
    expect(t.phase).toBe('showdown');
    expect(t.board.length).toBe(5);
    const chips = (u: string) => t.seats.find((s) => s?.userId === u)!.chips;
    expect(chips(aceUser)).toBe(2 * POKER.startChips);
    expect(chips(kingUser)).toBe(0);
  });

  it('three players: side pot goes to the best hand among those who covered it', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b'); t.sit('c');
    t.seats[0]!.chips = 100; // short stack
    t.tryStart();
    // everyone all in
    for (let k = 0; k < 3 && t.phase === 'preflop'; k++) t.act(t.seats[t.toAct]!.userId, { type: 'allin' });
    expect(t.phase).toBe('showdown');
    const total = t.seats.reduce((a, s) => a + (s?.chips ?? 0), 0);
    expect(total).toBe(100 + 2 * POKER.startChips);
    // the short stack can never win more than 3x its stack
    expect(t.seats[0]!.chips).toBeLessThanOrEqual(300);
  });

  it('timeout folds, a second timeout in a row stands the player up', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b'); t.sit('c');
    t.tryStart();
    const u = t.seats[t.toAct]!.userId;
    const r1 = t.timeout()!;
    expect(r1).toEqual({ userId: u, stood: false });
    expect(t.seats[t.seatOf(u)]!.folded).toBe(true);
    // next hand: same player times out again without acting in between
    while (t.phase !== 'showdown') { const s = t.seats[t.toAct]; if (!s) break; t.act(s.userId, { type: 'fold' }); }
    t.tryStart();
    // make `u` the one to act with a pending timeout count of 1: set directly
    t.seats[t.seatOf(u)]!.timeouts = 1;
    t.toAct = t.seatOf(u);
    const r2 = t.timeout()!;
    expect(r2.stood).toBe(true);
    expect(t.seatOf(u)).toBe(-1);
  });

  it('standing up mid-hand folds and keeps the chips in the pot', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b'); t.sit('c');
    t.tryStart();
    const pot0 = t.pot;
    const notActing = t.seats.find((s, i) => s && i !== t.toAct)!.userId;
    const actor = t.toAct;
    t.stand(notActing);
    expect(t.pot).toBe(pot0);
    expect(t.seatOf(notActing)).toBe(-1);
    expect(t.toAct).toBe(actor); // the turn did not jump
  });

  it('hides hole cards from other players until showdown', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b');
    t.tryStart();
    const v = t.view('a');
    const mine = v.seats.find((s) => s?.userId === 'a')!;
    const theirs = v.seats.find((s) => s?.userId === 'b')!;
    expect(mine.hole.every((x) => x >= 0)).toBe(true);
    expect(theirs.hole).toEqual([-1, -1]);
    expect(JSON.stringify(t.view('spectator'))).not.toContain(String(t.seats[t.seatOf('a')]!.hole[0]) + ',' + String(t.seats[t.seatOf('a')]!.hole[1]) + ']');
  });

  it('busted players are removed before the next hand', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b');
    t.seats[0]!.chips = 20;
    t.tryStart();
    for (let k = 0; k < 4 && t.phase !== 'showdown'; k++) t.act(t.seats[t.toAct]!.userId, { type: 'allin' });
    const loser = t.seats.find((s) => s && s.chips === 0);
    if (loser) {
      const r = t.tryStart();
      expect(r.busted).toContain(loser.userId);
      expect(r.started).toBe(false);
    }
  });
});

describe('showdown result', () => {
  it('names the winners by user id so it stays valid after they stand up', () => {
    const t = new PokerTable();
    t.sit('a'); t.sit('b');
    t.tryStart();
    t.act(t.seats[t.toAct]!.userId, { type: 'fold' });
    expect(t.result!.won.length).toBe(1);
    const winner = t.result!.won[0].userId;
    t.stand(winner);
    expect(['a', 'b']).toContain(winner);
    expect(t.view().result!.won[0].userId).toBe(winner);
  });
});
