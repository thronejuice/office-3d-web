import { UNO } from './constants';

// Uno for 2-6 players. A card is a two-character string: colour then value.
//   colours: r y g b (w = wild)      values: 0-9, S skip, R reverse, D draw two (wild: W colour change, F draw four)
// Rules chosen for a friendly office game (see DECISIONS.md): a draw-four may be played at any time, there is no
// "UNO!" penalty (the table just shows who has one card left), and a drawn card may be played or kept.

export type UnoColor = 'r' | 'y' | 'g' | 'b';
export type UnoCard = string;
export const UNO_COLORS: UnoColor[] = ['r', 'y', 'g', 'b'];

export function newUnoDeck(): UnoCard[] {
  const d: UnoCard[] = [];
  for (const c of UNO_COLORS) {
    d.push(`${c}0`);
    for (const v of '123456789SRD') d.push(`${c}${v}`, `${c}${v}`);
  }
  for (let i = 0; i < 4; i++) d.push('wW', 'wF');
  return d;
}

export const cardColor = (c: UnoCard) => c[0] as UnoColor | 'w';
export const cardValue = (c: UnoCard) => c[1];
export const isWild = (c: UnoCard) => c[0] === 'w';

export function shuffleUno<T>(a: T[], rng: () => number): T[] {
  const d = a.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Can `card` be played on `top` when the current colour is `color`? */
export const canPlayOn = (card: UnoCard, top: UnoCard, color: UnoColor) =>
  isWild(card) || cardColor(card) === color || cardValue(card) === cardValue(top);

export type UnoAction =
  | { type: 'play'; card: UnoCard; color?: UnoColor }
  | { type: 'draw' }
  | { type: 'pass' };
export type UnoPhase = 'waiting' | 'playing' | 'over';
export type UnoReason = 'emptied' | 'left';

interface Seat {
  userId: string;
  hand: UnoCard[];
  inRound: boolean; // dealt into the current round (late joiners wait for the next one)
  timeouts: number;
}

export interface UnoSeatView { userId: string; count: number; inRound: boolean }
export interface UnoEvent { seat: number; kind: 'play' | 'draw' | 'pass' | 'skip' | 'reverse'; card?: UnoCard; count?: number }

export interface UnoView {
  game: 'uno';
  phase: UnoPhase;
  seats: (UnoSeatView | null)[];
  hand: UnoCard[]; // the viewer's own cards
  playable: UnoCard[]; // which of them can be played right now
  top: UnoCard | null;
  color: UnoColor;
  dir: 1 | -1;
  turn: number;
  drew: boolean; // the player to act already drew this turn (may play that card or pass)
  drawCount: number;
  winner: string | null;
  reason: UnoReason | null;
  last: UnoEvent | null;
  handNo: number;
}

export class UnoTable {
  seats: (Seat | null)[];
  phase: UnoPhase = 'waiting';
  draw: UnoCard[] = [];
  discard: UnoCard[] = [];
  color: UnoColor = 'r';
  dir: 1 | -1 = 1;
  turn = -1;
  drew = false;
  private drawn: UnoCard | null = null;
  winner: string | null = null;
  reason: UnoReason | null = null;
  last: UnoEvent | null = null;
  handNo = 0;

  constructor(private rng: () => number = Math.random, private cfg = UNO) {
    this.seats = new Array(cfg.maxSeats).fill(null);
  }

  get occupied() { return this.seats.filter(Boolean).length; }
  seatOf(userId: string) { return this.seats.findIndex((s) => s && s.userId === userId); }
  private inRound = () => this.seats.map((s, i) => ({ s, i })).filter((x): x is { s: Seat; i: number } => !!x.s && x.s.inRound);
  private get top(): UnoCard | null { return this.discard.length ? this.discard[this.discard.length - 1] : null; }

  sit(userId: string): number {
    const have = this.seatOf(userId);
    if (have >= 0) return have;
    const free = this.seats.findIndex((s) => !s);
    if (free < 0) return -1;
    this.seats[free] = { userId, hand: [], inRound: false, timeouts: 0 };
    return free;
  }

  /** Leave the table. Cards in hand go back under the draw pile; if only one player is left they win. */
  stand(userId: string): boolean {
    const i = this.seatOf(userId);
    if (i < 0) return false;
    const s = this.seats[i]!;
    if (this.phase === 'playing' && s.inRound) {
      this.draw.unshift(...s.hand);
      const wasTurn = this.turn === i;
      const next = wasTurn ? this.nextSeat(i, 1) : -1;
      this.seats[i] = null;
      const left = this.inRound();
      if (left.length <= 1) this.finish(left[0]?.s.userId ?? null, 'left');
      else if (wasTurn) { this.turn = next; this.drew = false; this.drawn = null; }
    } else {
      this.seats[i] = null;
      if (this.phase === 'waiting') this.turn = -1;
    }
    return true;
  }

  /** Start a round when two or more players are seated. Returns true if one started. */
  tryStart(): boolean {
    if (this.phase === 'playing') return false;
    for (const s of this.seats) if (s) { s.hand = []; s.inRound = false; }
    if (this.occupied < this.cfg.minPlayers) { this.phase = 'waiting'; this.winner = null; this.reason = null; this.last = null; this.handNo = 0; this.turn = -1; this.draw = []; this.discard = []; return false; }
    this.handNo++;
    this.winner = null; this.reason = null; this.last = null;
    this.draw = shuffleUno(newUnoDeck(), this.rng);
    this.discard = [];
    this.dir = 1;
    this.drew = false; this.drawn = null;
    const players = this.seats.map((s, i) => ({ s, i })).filter((x): x is { s: Seat; i: number } => !!x.s);
    for (let k = 0; k < this.cfg.handSize; k++) for (const { s } of players) s.hand.push(this.draw.pop()!);
    for (const { s } of players) { s.inRound = true; s.timeouts = 0; }
    // the first card must be a plain number card so nobody starts under an effect
    for (;;) {
      const c = this.draw.pop()!;
      if (/\d/.test(cardValue(c))) { this.discard.push(c); this.color = cardColor(c) as UnoColor; break; }
      this.draw.unshift(c);
    }
    this.turn = players[(this.handNo - 1) % players.length].i; // the starting seat rotates every round
    this.phase = 'playing';
    return true;
  }

  private nextSeat(from: number, steps: number): number {
    let i = from;
    const n = this.seats.length;
    for (let k = 0; k < steps; k++) {
      do { i = (i + this.dir + n) % n; } while (!this.seats[i]?.inRound);
    }
    return i;
  }

  private take(i: number, count: number): UnoCard[] {
    const got: UnoCard[] = [];
    for (let k = 0; k < count; k++) {
      if (!this.draw.length) {
        const keep = this.discard.pop();
        this.draw = shuffleUno(this.discard, this.rng);
        this.discard = keep ? [keep] : [];
      }
      const c = this.draw.pop();
      if (!c) break; // every card is in somebody's hand
      got.push(c);
    }
    this.seats[i]!.hand.push(...got);
    return got;
  }

  private playableCards(i: number): UnoCard[] {
    const s = this.seats[i];
    const top = this.top;
    if (!s || !top || this.phase !== 'playing' || this.turn !== i) return [];
    const cards = this.drew && this.drawn ? [this.drawn] : s.hand;
    return [...new Set(cards.filter((c) => canPlayOn(c, top, this.color)))];
  }

  private endTurn(steps = 1) {
    this.turn = this.nextSeat(this.turn, steps);
    this.drew = false;
    this.drawn = null;
  }

  private finish(winner: string | null, reason: UnoReason) {
    this.phase = 'over';
    this.winner = winner;
    this.reason = reason;
    this.turn = -1;
  }

  /** Returns an error code or null. */
  act(userId: string, a: UnoAction): string | null {
    if (this.phase !== 'playing') return 'no_game';
    const i = this.seatOf(userId);
    const seat = i >= 0 ? this.seats[i]! : null;
    if (!seat || !seat.inRound) return 'not_seated';
    if (this.turn !== i) return 'not_your_turn';
    switch (a.type) {
      case 'draw': {
        if (this.drew) return 'already_drew';
        const got = this.take(i, 1);
        this.last = { seat: i, kind: 'draw', count: got.length };
        seat.timeouts = 0;
        if (got.length && canPlayOn(got[0], this.top!, this.color)) { this.drew = true; this.drawn = got[0]; }
        else this.endTurn(); // nothing playable: the turn passes by itself
        return null;
      }
      case 'pass':
        if (!this.drew) return 'must_draw';
        this.last = { seat: i, kind: 'pass' };
        this.endTurn();
        seat.timeouts = 0;
        return null;
      case 'play': {
        const card = String(a.card);
        if (!seat.hand.includes(card)) return 'no_such_card';
        if (!this.playableCards(i).includes(card)) return 'cannot_play';
        let color: UnoColor | null = null;
        if (isWild(card)) {
          if (!UNO_COLORS.includes(a.color as UnoColor)) return 'choose_color';
          color = a.color as UnoColor;
        }
        seat.hand.splice(seat.hand.indexOf(card), 1);
        this.discard.push(card);
        this.color = color ?? (cardColor(card) as UnoColor);
        seat.timeouts = 0;
        this.last = { seat: i, kind: 'play', card };
        if (seat.hand.length === 0) { this.finish(seat.userId, 'emptied'); return null; }
        const v = cardValue(card);
        const players = this.inRound().length;
        if (v === 'R') { this.dir = (this.dir * -1) as 1 | -1; this.endTurn(players === 2 ? 2 : 1); }
        else if (v === 'S') this.endTurn(2);
        else if (v === 'D' || v === 'F') {
          const victim = this.nextSeat(i, 1);
          this.take(victim, v === 'D' ? 2 : 4);
          this.endTurn(2);
        } else this.endTurn();
        return null;
      }
      default: return 'bad_action';
    }
  }

  /** The player to act ran out of time: draw a card and pass. Too many in a row = stand up. */
  timeout(): { userId: string; stood: boolean } | null {
    if (this.phase !== 'playing' || this.turn < 0) return null;
    const i = this.turn, seat = this.seats[i]!;
    const userId = seat.userId;
    seat.timeouts++;
    if (seat.timeouts >= this.cfg.maxTimeouts) { this.stand(userId); return { userId, stood: true }; }
    if (!this.drew) this.take(i, 1);
    this.last = { seat: i, kind: 'pass' };
    this.endTurn();
    return { userId, stood: false };
  }

  view(userId?: string): UnoView {
    const me = userId ? this.seatOf(userId) : -1;
    return {
      game: 'uno', phase: this.phase,
      seats: this.seats.map((s) => (s ? { userId: s.userId, count: s.hand.length, inRound: s.inRound } : null)),
      hand: me >= 0 ? this.seats[me]!.hand.slice() : [],
      playable: me >= 0 ? this.playableCards(me) : [],
      top: this.top, color: this.color, dir: this.dir, turn: this.turn, drew: this.drew, drawCount: this.draw.length,
      winner: this.winner, reason: this.reason, last: this.last, handNo: this.handNo,
    };
  }
}
