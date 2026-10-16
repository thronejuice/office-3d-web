import { BINGO } from './constants';

// Bingo for 2-6 players: a 5x5 card with the usual columns B 1-15, I 16-30, N 31-45, G 46-60, O 61-75 and a free
// centre. The server calls a number every few seconds; players tap the called numbers on their own card and press
// "bingo" when they have five in a row, column or diagonal. Everything is validated on the server.

export const BINGO_LETTERS = 'BINGO';
export const bingoLetter = (n: number) => BINGO_LETTERS[Math.min(4, Math.floor((n - 1) / 15))];
export const FREE = 0; // value of the centre square on a card
export const CENTRE = 12;

/** The twelve winning lines as indices into a 25-square card (row-major). */
export const LINES: number[][] = (() => {
  const l: number[][] = [];
  for (let r = 0; r < 5; r++) l.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) l.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  l.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  return l;
})();

export function shuffleBingo<T>(a: T[], rng: () => number): T[] {
  const d = a.slice();
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

/** A random card: 5 distinct numbers per column from that column's range, row-major, centre = FREE. */
export function makeCard(rng: () => number): number[] {
  const card = new Array<number>(25).fill(FREE);
  for (let c = 0; c < 5; c++) {
    const nums = shuffleBingo(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1), rng).slice(0, 5);
    for (let r = 0; r < 5; r++) card[r * 5 + c] = nums[r];
  }
  card[CENTRE] = FREE;
  return card;
}

export const freshMarks = (): boolean[] => Array.from({ length: 25 }, (_, i) => i === CENTRE);

/** The first complete line in `marks`, or null. */
export const completeLine = (marks: boolean[]): number[] | null => LINES.find((l) => l.every((i) => marks[i])) ?? null;
/** Squares still missing on the best line. */
export const toGo = (marks: boolean[]): number => Math.min(...LINES.map((l) => l.filter((i) => !marks[i]).length));

export type BingoAction = { type: 'mark'; n: number } | { type: 'claim' };
export type BingoPhase = 'waiting' | 'playing' | 'over';
export type BingoReason = 'bingo' | 'exhausted' | 'left';

interface Seat { userId: string; card: number[]; marks: boolean[]; inRound: boolean }

export interface BingoSeatView { userId: string; inRound: boolean; toGo: number }
export interface BingoView {
  game: 'bingo';
  phase: BingoPhase;
  seats: (BingoSeatView | null)[];
  card: number[]; // your own card, [] if you are not in the round
  marks: boolean[];
  called: number[]; // in the order they were called
  winner: string | null;
  line: number[] | null; // the winning line, as indices into the winner's card
  winnerCard: number[]; // shown at the end so everybody can see why they won
  reason: BingoReason | null;
  handNo: number;
}

export class BingoTable {
  seats: (Seat | null)[];
  phase: BingoPhase = 'waiting';
  called: number[] = [];
  private pool: number[] = [];
  winner: string | null = null;
  line: number[] | null = null;
  reason: BingoReason | null = null;
  handNo = 0;
  private winnerCard: number[] = [];

  constructor(private rng: () => number = Math.random, private cfg = BINGO) {
    this.seats = new Array(cfg.maxSeats).fill(null);
  }

  get occupied() { return this.seats.filter(Boolean).length; }
  seatOf(userId: string) { return this.seats.findIndex((s) => s && s.userId === userId); }
  private inRound = () => this.seats.filter((s): s is Seat => !!s && s.inRound);

  sit(userId: string): number {
    const have = this.seatOf(userId);
    if (have >= 0) return have;
    const free = this.seats.findIndex((s) => !s);
    if (free < 0) return -1;
    this.seats[free] = { userId, card: [], marks: [], inRound: false };
    return free;
  }

  /** Leaving mid-round: if nobody is left to play against the round is called off. */
  stand(userId: string): boolean {
    const i = this.seatOf(userId);
    if (i < 0) return false;
    this.seats[i] = null;
    if (this.phase === 'playing' && this.inRound().length < this.cfg.minPlayers) this.finish(null, 'left', null, []);
    else if (this.phase === 'waiting' && this.occupied < this.cfg.minPlayers) this.handNo = 0;
    return true;
  }

  /** Deal a card to everybody seated and start the round. Returns true if one started. */
  tryStart(): boolean {
    if (this.phase === 'playing') return false;
    for (const s of this.seats) if (s) { s.card = []; s.marks = []; s.inRound = false; }
    this.winner = null; this.line = null; this.reason = null; this.called = []; this.winnerCard = [];
    if (this.occupied < this.cfg.minPlayers) { this.phase = 'waiting'; this.handNo = 0; return false; }
    this.handNo++;
    this.pool = shuffleBingo(Array.from({ length: 75 }, (_, i) => i + 1), this.rng);
    for (const s of this.seats) if (s) { s.card = makeCard(this.rng); s.marks = freshMarks(); s.inRound = true; }
    this.phase = 'playing';
    return true;
  }

  /** Call the next number. Returns it, or null when the round is not running / the numbers are used up. */
  callNext(): number | null {
    if (this.phase !== 'playing') return null;
    const n = this.pool.pop();
    if (n === undefined) { this.finish(null, 'exhausted', null, []); return null; }
    this.called.push(n);
    return n;
  }

  private finish(winner: string | null, reason: BingoReason, line: number[] | null, card: number[]) {
    this.phase = 'over';
    this.winner = winner; this.reason = reason; this.line = line; this.winnerCard = card;
  }

  /** Returns an error code or null. */
  act(userId: string, a: BingoAction): string | null {
    if (this.phase !== 'playing') return 'no_game';
    const seat = this.seats[this.seatOf(userId)];
    if (!seat || !seat.inRound) return 'not_seated';
    if (a.type === 'mark') {
      const n = Number(a.n);
      const i = seat.card.indexOf(n);
      if (!Number.isInteger(n) || n === FREE || i < 0) return 'not_on_card';
      if (!this.called.includes(n)) return 'not_called';
      seat.marks[i] = !seat.marks[i];
      return null;
    }
    if (a.type === 'claim') {
      const line = completeLine(seat.marks);
      // marks are only ever set on called numbers, but check again so a bug can never award a win
      if (!line || !line.every((i) => i === CENTRE || this.called.includes(seat.card[i]))) return 'no_bingo';
      this.finish(seat.userId, 'bingo', line, seat.card.slice());
      return null;
    }
    return 'bad_action';
  }

  view(userId?: string): BingoView {
    const me = userId ? this.seats[this.seatOf(userId)] : null;
    return {
      game: 'bingo', phase: this.phase,
      seats: this.seats.map((s) => (s ? { userId: s.userId, inRound: s.inRound, toGo: s.inRound ? toGo(s.marks) : 5 } : null)),
      card: me?.inRound ? me.card.slice() : [], marks: me?.inRound ? me.marks.slice() : [],
      called: this.called.slice(), winner: this.winner, line: this.line, winnerCard: this.winnerCard.slice(), reason: this.reason, handNo: this.handNo,
    };
  }
}
