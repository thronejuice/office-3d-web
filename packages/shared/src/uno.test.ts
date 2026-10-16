import { describe, expect, it } from 'vitest';
import { UnoTable, canPlayOn, newUnoDeck } from './uno';
import { UNO } from './constants';

/** A started table with fixed hands: seat 0 acts first, top card r5, colour red. */
function table(hands: string[][], top = 'r5', color: 'r' | 'y' | 'g' | 'b' = 'r') {
  const t = new UnoTable(() => 0.5);
  hands.forEach((_, i) => t.sit(`p${i}`));
  t.tryStart();
  hands.forEach((h, i) => { t.seats[i]!.hand = h.slice(); });
  t.discard = [top];
  t.color = color;
  t.turn = 0;
  t.dir = 1;
  t.draw = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'];
  return t;
}
const play = (t: UnoTable, who: string, card: string, color?: 'r' | 'y' | 'g' | 'b') => t.act(who, { type: 'play', card, color });

describe('deck', () => {
  it('has the 108 standard cards', () => {
    const d = newUnoDeck();
    expect(d.length).toBe(108);
    expect(d.filter((c) => c[0] === 'w').length).toBe(8);
    expect(d.filter((c) => c === 'r0').length).toBe(1);
    expect(d.filter((c) => c === 'g7').length).toBe(2);
    expect(d.filter((c) => c === 'bD').length).toBe(2);
  });
  it('matches by colour, by value, or wild', () => {
    expect(canPlayOn('r9', 'r5', 'r')).toBe(true);
    expect(canPlayOn('b5', 'r5', 'r')).toBe(true);
    expect(canPlayOn('b9', 'r5', 'r')).toBe(false);
    expect(canPlayOn('wW', 'r5', 'r')).toBe(true);
    expect(canPlayOn('b9', 'r5', 'b')).toBe(true); // after a wild chose blue
  });
});

describe('starting a round', () => {
  it('needs two players, deals 7 each and starts on a number card', () => {
    const t = new UnoTable();
    t.sit('a');
    expect(t.tryStart()).toBe(false);
    t.sit('b'); t.sit('c');
    expect(t.tryStart()).toBe(true);
    for (const s of t.seats.filter(Boolean)) expect(s!.hand.length).toBe(UNO.handSize);
    expect(t.discard.length).toBe(1);
    expect(/\d/.test(t.discard[0][1])).toBe(true);
    expect(t.draw.length + t.discard.length + 3 * UNO.handSize).toBe(108);
    expect(t.phase).toBe('playing');
  });
  it('a player who sits mid-round waits for the next one', () => {
    const t = table([['r1'], ['r2']]);
    t.sit('late');
    expect(play(t, 'late', 'r1')).toBe('not_seated');
    expect(t.view('late').hand).toEqual([]);
  });
});

describe('playing cards', () => {
  it('only on your turn, only cards you hold, only playable ones', () => {
    const t = table([['r1', 'b9'], ['r2', 'g3']]);
    expect(play(t, 'p1', 'r2')).toBe('not_your_turn');
    expect(play(t, 'p0', 'g3')).toBe('no_such_card');
    expect(play(t, 'p0', 'b9')).toBe('cannot_play');
    expect(play(t, 'p0', 'r1')).toBeNull();
    expect(t.turn).toBe(1);
    expect(t.discard.at(-1)).toBe('r1');
  });

  it('a wild needs a colour and sets it', () => {
    const t = table([['wW', 'r1'], ['b2', 'g3'], ['y1']]);
    expect(play(t, 'p0', 'wW')).toBe('choose_color');
    expect(play(t, 'p0', 'wW', 'g')).toBeNull();
    expect(t.color).toBe('g');
    expect(play(t, 'p1', 'g3')).toBeNull(); // follows the new colour
  });

  it('skip jumps over the next player; reverse turns the order', () => {
    const t = table([['rS', 'r1'], ['r2'], ['r3'], ['r4']]);
    play(t, 'p0', 'rS');
    expect(t.turn).toBe(2);
    const u = table([['rR', 'r1'], ['r2'], ['r3'], ['r4']]);
    play(u, 'p0', 'rR');
    expect(u.dir).toBe(-1);
    expect(u.turn).toBe(3); // counter-clockwise from seat 0 is seat 3
  });

  it('with two players a reverse acts like a skip', () => {
    const t = table([['rR', 'r1'], ['r2']]);
    play(t, 'p0', 'rR');
    expect(t.turn).toBe(0);
  });

  it('draw two and draw four make the next player draw and lose their turn', () => {
    const t = table([['rD', 'r1'], ['r2'], ['r3']]);
    play(t, 'p0', 'rD');
    expect(t.seats[1]!.hand.length).toBe(3);
    expect(t.turn).toBe(2);
    const u = table([['wF', 'r1'], ['r2'], ['r3']]);
    play(u, 'p0', 'wF', 'y');
    expect(u.seats[1]!.hand.length).toBe(5);
    expect(u.color).toBe('y');
    expect(u.turn).toBe(2);
  });

  it('emptying your hand wins the round', () => {
    const t = table([['r1'], ['r2', 'r3']]);
    play(t, 'p0', 'r1');
    expect(t.phase).toBe('over');
    expect(t.winner).toBe('p0');
    expect(t.reason).toBe('emptied');
    expect(play(t, 'p1', 'r2')).toBe('no_game');
  });
});

describe('drawing', () => {
  it('an unplayable draw passes the turn by itself', () => {
    const t = table([['g1'], ['r2']]);
    t.draw = ['y9']; // not playable on r5
    expect(t.act('p0', { type: 'draw' })).toBeNull();
    expect(t.seats[0]!.hand).toEqual(['g1', 'y9']);
    expect(t.turn).toBe(1);
  });

  it('a playable draw may be played or kept (pass), and nothing else may be played that turn', () => {
    const t = table([['r8', 'g1'], ['r2']]);
    t.draw = ['r7'];
    t.act('p0', { type: 'draw' });
    expect(t.turn).toBe(0);
    expect(t.view('p0').playable).toEqual(['r7']);
    expect(play(t, 'p0', 'r8')).toBe('cannot_play'); // only the card just drawn
    expect(t.act('p0', { type: 'draw' })).toBe('already_drew');
    expect(t.act('p0', { type: 'pass' })).toBeNull();
    expect(t.turn).toBe(1);
    const u = table([['r8'], ['r2']]);
    u.draw = ['r7'];
    u.act('p0', { type: 'draw' });
    expect(play(u, 'p0', 'r7')).toBeNull();
  });

  it('cannot pass without drawing', () => {
    const t = table([['r8'], ['r2']]);
    expect(t.act('p0', { type: 'pass' })).toBe('must_draw');
  });

  it('reshuffles the discard pile when the draw pile runs out, keeping the top card', () => {
    const t = table([['g1'], ['r2']]);
    t.draw = [];
    t.discard = ['b1', 'b2', 'b3', 'r5'];
    t.act('p0', { type: 'draw' });
    expect(t.seats[0]!.hand.length).toBe(2);
    expect(t.discard).toEqual(['r5']);
  });
});

describe('leaving and timeouts', () => {
  it('standing up returns the cards to the draw pile and hands over the turn', () => {
    const t = table([['r1', 'r2'], ['g1'], ['g2']]);
    const before = t.draw.length;
    t.stand('p0');
    expect(t.draw.length).toBe(before + 2);
    expect(t.turn).toBe(1);
    expect(t.phase).toBe('playing');
  });
  it('the last player left wins', () => {
    const t = table([['r1'], ['g1']]);
    t.stand('p1');
    expect(t.phase).toBe('over');
    expect(t.winner).toBe('p0');
    expect(t.reason).toBe('left');
  });
  it('a timeout draws one card and passes; two in a row stand the player up', () => {
    const t = table([['g1'], ['g2'], ['g3']]);
    const r = t.timeout()!;
    expect(r).toEqual({ userId: 'p0', stood: false });
    expect(t.seats[0]!.hand.length).toBe(2);
    expect(t.turn).toBe(1);
    t.turn = 0;
    expect(t.timeout()).toEqual({ userId: 'p0', stood: true });
    expect(t.seatOf('p0')).toBe(-1);
  });
});

describe('views', () => {
  it('shows only your own cards, other hands as counts', () => {
    const t = table([['r1', 'g2'], ['b3']]);
    const v = t.view('p1');
    expect(v.hand).toEqual(['b3']);
    expect(v.seats[0]!.count).toBe(2);
    expect(JSON.stringify(v)).not.toContain('g2');
    expect(t.view('spectator').hand).toEqual([]);
  });
  it('the next round starts from the next seat', () => {
    const t = new UnoTable(() => 0.5);
    t.sit('a'); t.sit('b'); t.sit('c');
    t.tryStart();
    const first = t.turn;
    t.phase = 'over';
    t.tryStart();
    expect(t.turn).not.toBe(first);
  });
});
