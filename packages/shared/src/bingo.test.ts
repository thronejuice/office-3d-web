import { describe, expect, it } from 'vitest';
import { BingoTable, CENTRE, FREE, LINES, bingoLetter, completeLine, freshMarks, makeCard, toGo } from './bingo';
import { BINGO } from './constants';

describe('cards', () => {
  it('has 24 distinct numbers in the right columns and a free centre', () => {
    for (let k = 0; k < 50; k++) {
      const card = makeCard(Math.random);
      expect(card[CENTRE]).toBe(FREE);
      const nums = card.filter((_, i) => i !== CENTRE);
      expect(new Set(nums).size).toBe(24);
      for (let i = 0; i < 25; i++) {
        if (i === CENTRE) continue;
        const c = i % 5;
        expect(card[i]).toBeGreaterThanOrEqual(c * 15 + 1);
        expect(card[i]).toBeLessThanOrEqual(c * 15 + 15);
      }
    }
  });
  it('letters follow the columns', () => {
    expect([1, 15, 16, 31, 46, 61, 75].map(bingoLetter).join('')).toBe('BBINGOO');
  });
  it('has twelve lines through five squares each', () => {
    expect(LINES.length).toBe(12);
    expect(LINES.every((l) => l.length === 5)).toBe(true);
    expect(LINES.filter((l) => l.includes(CENTRE)).length).toBe(4); // middle row, middle column, both diagonals
  });
  it('finds complete lines and counts what is missing', () => {
    const m = freshMarks();
    expect(toGo(m)).toBe(4); // the free centre already counts
    expect(completeLine(m)).toBeNull();
    for (const i of [10, 11, 13, 14]) m[i] = true; // middle row
    expect(completeLine(m)).toEqual([10, 11, 12, 13, 14]);
    expect(toGo(m)).toBe(0);
  });
});

/** A started table with known cards: player a's first row is 1,16,31,46,61 style numbers; rig by overwriting. */
function started() {
  const t = new BingoTable(() => 0.5);
  t.sit('a'); t.sit('b');
  t.tryStart();
  return t;
}
const seat = (t: BingoTable, u: string) => t.seats[t.seatOf(u)]!;

describe('a round', () => {
  it('needs two players and deals everybody a card', () => {
    const t = new BingoTable();
    t.sit('a');
    expect(t.tryStart()).toBe(false);
    t.sit('b');
    expect(t.tryStart()).toBe(true);
    expect(t.phase).toBe('playing');
    expect(seat(t, 'a').card.length).toBe(25);
    expect(seat(t, 'a').card).not.toEqual(seat(t, 'b').card);
  });

  it('calls each number once, in 1..75', () => {
    const t = started();
    const seen = new Set<number>();
    for (let i = 0; i < 75; i++) { const n = t.callNext()!; expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(75); expect(seen.has(n)).toBe(false); seen.add(n); }
    expect(t.callNext()).toBeNull();
    expect(t.phase).toBe('over');
    expect(t.reason).toBe('exhausted');
  });

  it('you can only mark numbers that were called and are on your card', () => {
    const t = started();
    const s = seat(t, 'a');
    const onCard = s.card.find((n, i) => i !== CENTRE && n !== FREE)!;
    expect(t.act('a', { type: 'mark', n: onCard })).toBe('not_called');
    expect(t.act('a', { type: 'mark', n: 76 })).toBe('not_on_card');
    expect(t.act('a', { type: 'mark', n: FREE })).toBe('not_on_card');
    t.called.push(onCard);
    expect(t.act('a', { type: 'mark', n: onCard })).toBeNull();
    expect(s.marks[s.card.indexOf(onCard)]).toBe(true);
    expect(t.act('a', { type: 'mark', n: onCard })).toBeNull(); // tapping again takes the mark off
    expect(s.marks[s.card.indexOf(onCard)]).toBe(false);
  });

  it('a claim needs a real line; the first valid claim wins the round', () => {
    const t = started();
    expect(t.act('a', { type: 'claim' })).toBe('no_bingo');
    const a = seat(t, 'a');
    // call and mark the middle row of a's card
    for (const i of [10, 11, 13, 14]) { t.called.push(a.card[i]); t.act('a', { type: 'mark', n: a.card[i] }); }
    expect(t.act('b', { type: 'claim' })).toBe('no_bingo');
    expect(t.act('a', { type: 'claim' })).toBeNull();
    expect(t.phase).toBe('over');
    expect(t.winner).toBe('a');
    expect(t.line).toEqual([10, 11, 12, 13, 14]);
    expect(t.view('b').winnerCard).toEqual(a.card); // everybody sees the winning card
    expect(t.act('b', { type: 'mark', n: 1 })).toBe('no_game');
  });

  it('marks cannot be set without the number being called', () => {
    const t = started();
    const a = seat(t, 'a');
    a.marks = a.marks.map(() => true); // tampering with the state directly...
    expect(t.act('a', { type: 'claim' })).toBe('no_bingo'); // ...is still refused: nothing was called
  });

  it('keeps cards private but shows how close everybody is', () => {
    const t = started();
    const v = t.view('a');
    expect(v.card).toEqual(seat(t, 'a').card);
    expect(t.view('b').card).toEqual(seat(t, 'b').card);
    expect(t.view('nobody').card).toEqual([]);
    expect(JSON.stringify(v.seats)).not.toContain(String(seat(t, 'b').card[0]) + ',');
    expect(v.seats.find((s) => s && s.userId === 'b')!.toGo).toBe(4);
  });

  it('a player who sits mid-round waits; the next round deals them in', () => {
    const t = started();
    t.sit('late');
    expect(t.act('late', { type: 'mark', n: 1 })).toBe('not_seated');
    t.act('a', { type: 'claim' }); // no-op error
    t.phase = 'over';
    t.tryStart();
    expect(seat(t, 'late').inRound).toBe(true);
  });

  it('leaving until one player is left calls the round off', () => {
    const t = started();
    t.stand('b');
    expect(t.phase).toBe('over');
    expect(t.reason).toBe('left');
    expect(t.winner).toBeNull();
    expect(t.tryStart()).toBe(false);
    expect(t.phase).toBe('waiting');
  });

  it('uses the configured timings', () => {
    expect(BINGO.callMs).toBeGreaterThan(0);
  });
});
