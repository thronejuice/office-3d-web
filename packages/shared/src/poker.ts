import { POKER } from './constants';

/** Card 0..51: rank = c % 13 (0 = deuce … 12 = ace), suit = floor(c / 13). */
export type Card = number;
export const rankOf = (c: Card) => c % 13;
export const suitOf = (c: Card) => Math.floor(c / 13);

export const HAND_NAMES = ['ไพ่สูง', 'หนึ่งคู่', 'สองคู่', 'สามตัว', 'สเตรท', 'ฟลัช', 'ฟูลเฮาส์', 'โฟร์การ์ด', 'สเตรทฟลัช'] as const;

export function newDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

export function shuffle(deck: Card[], rng: () => number): Card[] {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Score of exactly five cards; larger is better. category * 13^5 + packed kickers. */
export function score5(cs: Card[]): number {
  const r = cs.map(rankOf).sort((a, b) => b - a);
  const flush = cs.every((c) => suitOf(c) === suitOf(cs[0]));
  let straightHigh = -1;
  if (new Set(r).size === 5) {
    if (r[0] - r[4] === 4) straightHigh = r[0];
    else if (r[0] === 12 && r[1] === 3 && r[2] === 2 && r[3] === 1 && r[4] === 0) straightHigh = 3; // wheel: A-2-3-4-5
  }
  const counts = new Map<number, number>();
  for (const x of r) counts.set(x, (counts.get(x) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);
  let cat: number;
  let kick: number[];
  if (straightHigh >= 0 && flush) { cat = 8; kick = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = 7; kick = byGroup; }
  else if (groups[0][1] === 3 && groups[1]?.[1] === 2) { cat = 6; kick = byGroup; }
  else if (flush) { cat = 5; kick = r; }
  else if (straightHigh >= 0) { cat = 4; kick = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = 3; kick = byGroup; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; kick = byGroup; }
  else if (groups[0][1] === 2) { cat = 1; kick = byGroup; }
  else { cat = 0; kick = r; }
  const packed = [...kick, 0, 0, 0, 0, 0].slice(0, 5).reduce((a, x) => a * 13 + x, 0);
  return cat * 13 ** 5 + packed;
}

export interface BestHand { score: number; category: number; name: string; cards: Card[] }

/** Best five of up to seven cards. */
export function bestHand(cards: Card[]): BestHand {
  let best: { score: number; cards: Card[] } | null = null;
  const n = cards.length;
  const pick = (start: number, chosen: Card[]) => {
    if (chosen.length === 5) {
      const s = score5(chosen);
      if (!best || s > best.score) best = { score: s, cards: chosen.slice() };
      return;
    }
    for (let i = start; i < n; i++) { chosen.push(cards[i]); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  const b = best!;
  const category = Math.floor(b.score / 13 ** 5);
  const royal = category === 8 && b.cards.some((c) => rankOf(c) === 12) && b.cards.some((c) => rankOf(c) === 8);
  return { score: b.score, category, name: royal ? 'รอยัลฟลัช' : HAND_NAMES[category], cards: b.cards };
}

// ---------------------------------------------------------------------------------------------------------------------
// Table state machine (Texas Hold'em, no-limit, fixed blinds). Pure data + methods; the server owns timers and sockets.
// ---------------------------------------------------------------------------------------------------------------------

export type Phase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';
export interface PokerAction { type: ActionType; amount?: number } // raise: total bet ("raise to")

interface Seat {
  userId: string;
  chips: number;
  hole: Card[];
  bet: number; // this street
  total: number; // this hand
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  timeouts: number;
  leaving: boolean; // stood up mid-hand: folded, removed when the hand ends
}

export interface PokerResult {
  /** one entry per pot, in order main -> side */
  pots: { amount: number; winners: number[] }[];
  won: { seat: number; userId: string; amount: number }[];
  /** seats that showed down, with their best hand */
  shown: Record<number, { name: string; cards: Card[] }>;
}

export interface SeatView {
  userId: string;
  chips: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  inHand: boolean;
  leaving: boolean; // stood up mid-hand
  hole: Card[]; // [] when not visible to the viewer; [-1,-1] = face-down
}

export interface PokerView {
  game: 'poker';
  phase: Phase;
  board: Card[];
  pot: number;
  currentBet: number;
  minRaise: number;
  button: number;
  toAct: number;
  handNo: number;
  seats: (SeatView | null)[];
  result: PokerResult | null;
}

export type PokerConfig = { [K in keyof typeof POKER]: number };

export class PokerTable {
  seats: (Seat | null)[];
  phase: Phase = 'waiting';
  board: Card[] = [];
  button = -1;
  toAct = -1;
  currentBet = 0;
  minRaise: number;
  handNo = 0;
  result: PokerResult | null = null;
  private deck: Card[] = [];

  constructor(private rng: () => number = Math.random, private cfg: PokerConfig = POKER) {
    this.seats = new Array(cfg.maxSeats).fill(null);
    this.minRaise = cfg.bigBlind;
  }

  private active(): Seat | null { return this.toAct >= 0 ? this.seats[this.toAct] : null; }
  private live = () => this.seats.map((s, i) => ({ s, i })).filter((x): x is { s: Seat; i: number } => !!x.s && x.s.hole.length === 2 && !x.s.folded);
  private inPlay = () => this.phase !== 'waiting' && this.phase !== 'showdown';

  seatOf(userId: string): number {
    return this.seats.findIndex((s) => s && !s.leaving && s.userId === userId);
  }
  get pot(): number { return this.seats.reduce((a, s) => a + (s?.total ?? 0), 0); }
  get occupied(): number { return this.seats.filter((s) => s && !s.leaving).length; }

  sit(userId: string): number {
    const have = this.seatOf(userId);
    if (have >= 0) return have;
    const free = this.seats.findIndex((s) => !s);
    if (free < 0) return -1;
    this.seats[free] = { userId, chips: this.cfg.startChips, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, timeouts: 0, leaving: false };
    return free;
  }

  /** Leave the table. In a live hand the player folds and their chips stay in the pot. */
  stand(userId: string): boolean {
    const i = this.seatOf(userId);
    if (i < 0) return false;
    const s = this.seats[i]!;
    if (this.inPlay() && s.hole.length === 2) {
      s.leaving = true;
      if (!s.folded) { s.folded = true; this.advance(); }
    } else this.seats[i] = null;
    return true;
  }

  /** Start a hand if two or more players have chips. Removes busted players first and returns their ids. */
  tryStart(): { started: boolean; busted: string[] } {
    const busted: string[] = [];
    if (this.inPlay()) return { started: false, busted };
    this.seats.forEach((s, i) => {
      if (s && (s.leaving || s.chips <= 0)) { if (!s.leaving) busted.push(s.userId); this.seats[i] = null; }
    });
    const elig = this.seats.map((s, i) => ({ s, i })).filter((x): x is { s: Seat; i: number } => !!x.s);
    if (elig.length < this.cfg.minPlayers) { this.phase = 'waiting'; this.result = null; this.toAct = -1; this.board = []; this.seats.forEach((s) => { if (s) { s.hole = []; s.bet = 0; s.total = 0; } }); return { started: false, busted }; }

    this.handNo++;
    this.result = null;
    this.board = [];
    this.deck = shuffle(newDeck(), this.rng);
    for (const { s } of elig) { s.hole = []; s.bet = 0; s.total = 0; s.folded = false; s.allIn = false; s.acted = false; }
    const order = (from: number) => { const r: number[] = []; for (let k = 1; k <= this.seats.length; k++) { const j = (from + k) % this.seats.length; if (this.seats[j]) r.push(j); } return r; };
    this.button = order(this.button < 0 ? -1 : this.button)[0];
    for (let r = 0; r < 2; r++) for (const j of order(this.button)) this.seats[j]!.hole.push(this.deck.pop()!);

    const [first, second] = order(this.button);
    const headsUp = elig.length === 2;
    const sb = headsUp ? this.button : first;
    const bb = headsUp ? first : second;
    this.post(sb, this.cfg.smallBlind);
    this.post(bb, this.cfg.bigBlind);
    this.currentBet = this.cfg.bigBlind;
    this.minRaise = this.cfg.bigBlind;
    this.phase = 'preflop';
    // first to act: left of the big blind (heads-up: the small blind / button)
    this.toAct = this.nextToAct(bb);
    if (this.toAct < 0) this.advance();
    return { started: true, busted };
  }

  private post(i: number, amt: number) {
    const s = this.seats[i]!;
    this.commit(s, Math.min(amt, s.chips));
  }
  private commit(s: Seat, amt: number) {
    s.chips -= amt; s.bet += amt; s.total += amt;
    if (s.chips === 0) s.allIn = true;
  }

  /** Next seat after `from` that still has to act this street, or -1. */
  private nextToAct(from: number): number {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n;
      const s = this.seats[j];
      if (s && s.hole.length === 2 && !s.folded && !s.allIn && (!s.acted || s.bet < this.currentBet)) return j;
    }
    return -1;
  }

  /** Apply one action. Returns an error code or null. */
  act(userId: string, a: PokerAction): string | null {
    if (!this.inPlay()) return 'no_hand';
    const i = this.seatOf(userId);
    if (i < 0 || i !== this.toAct) return 'not_your_turn';
    const s = this.seats[i]!;
    const toCall = this.currentBet - s.bet;
    switch (a.type) {
      case 'fold': s.folded = true; break;
      case 'check': if (toCall > 0) return 'cannot_check'; break;
      case 'call': this.commit(s, Math.min(toCall, s.chips)); break;
      case 'raise': {
        const to = Math.floor(Number(a.amount));
        if (!Number.isFinite(to)) return 'bad_amount';
        if (to >= s.bet + s.chips) return this.shove(s, i);
        if (to < this.currentBet + this.minRaise) return 'raise_too_small';
        const size = to - this.currentBet;
        this.commit(s, to - s.bet);
        this.minRaise = Math.max(this.minRaise, size);
        this.currentBet = to;
        this.reopen(i);
        break;
      }
      case 'allin': { const e = this.shove(s, i); if (e) return e; break; }
      default: return 'bad_action';
    }
    s.acted = true;
    s.timeouts = 0;
    this.advance();
    return null;
  }

  private shove(s: Seat, i: number): string | null {
    const amt = s.chips;
    if (amt <= 0) return 'no_chips';
    const nb = s.bet + amt;
    this.commit(s, amt);
    if (nb > this.currentBet) {
      const size = nb - this.currentBet;
      this.currentBet = nb;
      if (size >= this.minRaise) { this.minRaise = size; this.reopen(i); } // a short all-in does not reopen the betting
    }
    s.acted = true;
    s.timeouts = 0;
    this.advance();
    return null;
  }

  private reopen(except: number) {
    this.seats.forEach((o, j) => { if (o && j !== except && o.hole.length === 2 && !o.folded && !o.allIn) o.acted = false; });
  }

  /** The player to act ran out of time: fold. Two timeouts in a row = stand up. */
  timeout(): { userId: string; stood: boolean } | null {
    const s = this.active();
    if (!s || !this.inPlay()) return null;
    const userId = s.userId;
    s.timeouts++;
    const stand = s.timeouts >= this.cfg.maxTimeouts;
    if (stand) this.stand(userId);
    else { s.folded = true; s.acted = true; this.advance(); }
    return { userId, stood: stand };
  }

  private advance() {
    if (!this.inPlay()) return;
    const live = this.live();
    if (live.length <= 1) return this.finish(live);
    const canAct = live.filter((x) => !x.s.allIn);
    const done = canAct.every((x) => x.s.acted && x.s.bet === this.currentBet);
    if (!done) {
      const cur = this.active();
      if (cur && cur.hole.length === 2 && !cur.folded && !cur.allIn && (!cur.acted || cur.bet < this.currentBet)) return; // someone else folded/left: the turn stays
      this.toAct = this.nextToAct(this.toAct >= 0 ? this.toAct : this.button);
      if (this.toAct >= 0) return;
    }
    // street over
    for (;;) {
      this.nextStreet();
      if (this.phase === 'showdown') return this.finish(this.live());
      if (this.live().filter((x) => !x.s.allIn).length >= 2) break;
    }
    this.toAct = this.nextToAct(this.button);
  }

  private nextStreet() {
    this.seats.forEach((s) => { if (s) { s.bet = 0; s.acted = false; } });
    this.currentBet = 0;
    this.minRaise = this.cfg.bigBlind;
    if (this.phase === 'preflop') { this.board.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!); this.phase = 'flop'; }
    else if (this.phase === 'flop') { this.board.push(this.deck.pop()!); this.phase = 'turn'; }
    else if (this.phase === 'turn') { this.board.push(this.deck.pop()!); this.phase = 'river'; }
    else this.phase = 'showdown';
  }

  private finish(live: { s: Seat; i: number }[]) {
    this.toAct = -1;
    const pots: { amount: number; winners: number[] }[] = [];
    const won = new Map<number, number>();
    const shown: PokerResult['shown'] = {};
    const award = (seat: number, amt: number) => won.set(seat, (won.get(seat) ?? 0) + amt);

    if (live.length === 1) {
      const total = this.pot;
      award(live[0].i, total);
      pots.push({ amount: total, winners: [live[0].i] });
    } else {
      const hands = new Map<number, BestHand>();
      for (const { s, i } of live) {
        const h = bestHand([...s.hole, ...this.board]);
        hands.set(i, h);
        shown[i] = { name: h.name, cards: h.cards };
      }
      const all = this.seats.map((s, i) => ({ s, i })).filter((x): x is { s: Seat; i: number } => !!x.s && x.s.total > 0);
      const levels = [...new Set(live.map((x) => x.s.total))].sort((a, b) => a - b);
      let prev = 0;
      levels.forEach((level, idx) => {
        let amount = all.reduce((a, x) => a + Math.max(0, Math.min(x.s.total, level) - Math.min(x.s.total, prev)), 0);
        if (idx === levels.length - 1) amount += all.reduce((a, x) => a + Math.max(0, x.s.total - Math.max(level, prev)), 0);
        prev = level;
        const eligible = live.filter((x) => x.s.total >= level);
        const top = Math.max(...eligible.map((x) => hands.get(x.i)!.score));
        const winners = eligible.filter((x) => hands.get(x.i)!.score === top).map((x) => x.i);
        // odd chips go to the winner closest to the left of the button
        const n = this.seats.length;
        winners.sort((a, b) => ((a - this.button + n) % n) - ((b - this.button + n) % n));
        const share = Math.floor(amount / winners.length);
        let rem = amount - share * winners.length;
        for (const w of winners) { award(w, share + (rem > 0 ? 1 : 0)); if (rem > 0) rem--; }
        pots.push({ amount, winners });
      });
    }
    for (const [i, amt] of won) this.seats[i]!.chips += amt;
    this.phase = 'showdown';
    this.result = { pots, won: [...won].map(([seat, amount]) => ({ seat, userId: this.seats[seat]!.userId, amount })), shown };
  }

  /** Table as `userId` may see it: hole cards only for the viewer (and for showdown hands). */
  view(userId?: string): PokerView {
    const shown = this.result?.shown ?? {};
    return {
      game: 'poker', phase: this.phase, board: this.board.slice(), pot: this.pot, currentBet: this.currentBet, minRaise: this.minRaise,
      button: this.button, toAct: this.toAct, handNo: this.handNo, result: this.result,
      seats: this.seats.map((s, i) => {
        if (!s) return null;
        const inHand = s.hole.length === 2 && this.phase !== 'waiting';
        let hole: Card[] = [];
        if (inHand) hole = s.userId === userId || (this.phase === 'showdown' && shown[i]) ? s.hole.slice() : [-1, -1];
        return { userId: s.userId, chips: s.chips, bet: s.bet, folded: s.folded, allIn: s.allIn, inHand, leaving: s.leaving, hole };
      }),
    };
  }
}
