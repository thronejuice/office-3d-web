import { POKDENG } from './constants';
import { newDeck, shuffle, rankOf, suitOf, type Card } from './poker';

// Pok Deng (ป๊อกเด้ง) with play-money chips. One player is the dealer (เจ้ามือ), everybody else bets against the
// dealer. Cards are the same 0..51 numbers as poker. Rules and choices are listed in DECISIONS.md.

/** Point value of a card: A = 1, 2-9 = face value, 10 J Q K = 0. */
export const pdValue = (c: Card) => { const r = rankOf(c); return r === 12 ? 1 : r <= 7 ? r + 2 : 0; };
const isFace = (c: Card) => rankOf(c) >= 9 && rankOf(c) <= 11; // J Q K

export const PD_CATEGORIES = ['points', 'sian', 'straight', 'straightFlush', 'threeKind', 'pok8', 'pok9'] as const;
export type PdCategory = (typeof PD_CATEGORIES)[number];

export interface PdHand {
  category: PdCategory;
  points: number; // sum of values mod 10
  mult: number; // payout multiplier (เด้ง)
  strength: number; // compare hands by this; equal = tie
  name: string;
}

const NAMES: Record<PdCategory, string> = {
  points: 'แต้ม', sian: 'เซียน', straight: 'เรียง', straightFlush: 'สเตรทฟลัช', threeKind: 'ตอง', pok8: 'ป๊อก 8', pok9: 'ป๊อก 9',
};

function isStraight(cards: Card[]): boolean {
  const r = [...new Set(cards.map(rankOf))].sort((a, b) => a - b);
  if (r.length !== 3) return false;
  return r[2] - r[0] === 2 || (r[0] === 0 && r[1] === 1 && r[2] === 12); // A-2-3 counts, K-A-2 does not
}

/** Evaluate a two- or three-card hand. */
export function pdEvaluate(cards: Card[]): PdHand {
  const points = cards.reduce((n, c) => n + pdValue(c), 0) % 10;
  const sameSuit = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  let category: PdCategory = 'points';
  let mult = 1;
  if (cards.length === 2) {
    const pair = rankOf(cards[0]) === rankOf(cards[1]);
    if (pair || sameSuit) mult = 2;
    if (points === 9) category = 'pok9';
    else if (points === 8) category = 'pok8';
  } else {
    const trips = cards.every((c) => rankOf(c) === rankOf(cards[0]));
    if (trips) { category = 'threeKind'; mult = 5; }
    else if (isStraight(cards) && sameSuit) { category = 'straightFlush'; mult = 5; }
    else if (isStraight(cards)) { category = 'straight'; mult = 3; }
    else if (cards.every(isFace)) { category = 'sian'; mult = 3; }
    else if (sameSuit) mult = 3;
  }
  const cat = PD_CATEGORIES.indexOf(category);
  return { category, points, mult, strength: cat * 10 + (category === 'points' ? points : 0), name: category === 'points' ? `${points} แต้ม` : NAMES[category] };
}

export type PdAction = { type: 'bet'; amount: number } | { type: 'draw' } | { type: 'stay' };
export type PdPhase = 'waiting' | 'betting' | 'acting' | 'showdown';

interface Seat {
  userId: string;
  chips: number;
  bet: number; // 0 = has not bet yet (punters only)
  cards: Card[];
  done: boolean; // finished acting (stayed, drew, or has a pok)
  timeouts: number;
  inRound: boolean;
}

export interface PdResultLine { seat: number; userId: string; bet: number; delta: number; outcome: 'win' | 'lose' | 'tie'; hand: string }
export interface PdResult { dealer: { seat: number; userId: string; hand: string; delta: number }; lines: PdResultLine[] }

export interface PdSeatView {
  userId: string;
  chips: number;
  bet: number;
  inRound: boolean;
  isDealer: boolean;
  done: boolean;
  count: number; // cards held
  cards: Card[]; // face-up cards: yours, a pok, or everyone's at showdown; -1 = face down
  hand: string | null; // name of the hand when its cards are face up
}

export interface PdView {
  game: 'pokdeng';
  phase: PdPhase;
  dealer: number;
  toAct: number;
  seats: (PdSeatView | null)[];
  bets: readonly number[];
  result: PdResult | null;
  handNo: number;
}

export class PokDengTable {
  seats: (Seat | null)[];
  phase: PdPhase = 'waiting';
  dealer = -1;
  toAct = -1;
  result: PdResult | null = null;
  handNo = 0;
  private deck: Card[] = [];

  constructor(private rng: () => number = Math.random, private cfg = POKDENG) {
    this.seats = new Array(cfg.maxSeats).fill(null);
  }

  get occupied() { return this.seats.filter(Boolean).length; }
  seatOf(userId: string) { return this.seats.findIndex((s) => s && s.userId === userId); }
  private punters = () => this.seats.map((s, i) => ({ s, i })).filter((x): x is { s: Seat; i: number } => !!x.s && x.s.inRound && x.i !== this.dealer);
  private dealerSeat = () => (this.dealer >= 0 ? this.seats[this.dealer] : null);

  sit(userId: string): number {
    const have = this.seatOf(userId);
    if (have >= 0) return have;
    const free = this.seats.findIndex((s) => !s);
    if (free < 0) return -1;
    this.seats[free] = { userId, chips: this.cfg.startChips, bet: 0, cards: [], done: false, timeouts: 0, inRound: false };
    return free;
  }

  /** Leaving mid-round: a punter forfeits their bet to the dealer; the dealer leaving cancels the round. */
  stand(userId: string): boolean {
    const i = this.seatOf(userId);
    if (i < 0) return false;
    const s = this.seats[i]!;
    const live = (this.phase === 'betting' || this.phase === 'acting') && s.inRound;
    if (live && i === this.dealer) {
      this.seats[i] = null;
      this.cancelRound();
      return true;
    }
    if (live) {
      const d = this.dealerSeat();
      if (d && s.bet) d.chips += Math.min(s.bet, s.chips);
      const wasTurn = this.toAct === i;
      this.seats[i] = null;
      if (this.punters().length === 0) this.cancelRound(); // nobody left to play against
      else if (this.phase === 'betting') this.maybeDeal();
      else if (wasTurn) this.advance();
      else this.maybeShowdown();
      return true;
    }
    this.seats[i] = null;
    if (this.phase === 'waiting' && this.occupied < this.cfg.minPlayers) { this.dealer = -1; this.handNo = 0; }
    return true;
  }

  private cancelRound() {
    this.phase = 'waiting'; this.toAct = -1; this.result = null;
    for (const s of this.seats) if (s) { s.cards = []; s.bet = 0; s.done = false; s.inRound = false; }
  }

  /** Start a round when two or more players are seated. Returns the user ids removed for running out of chips. */
  tryStart(): { started: boolean; busted: string[] } {
    const busted: string[] = [];
    if (this.phase === 'betting' || this.phase === 'acting') return { started: false, busted };
    this.seats.forEach((s, i) => { if (s && s.chips <= 0) { busted.push(s.userId); this.seats[i] = null; if (i === this.dealer) this.dealer = -1; } });
    for (const s of this.seats) if (s) { s.cards = []; s.bet = 0; s.done = false; s.inRound = false; }
    this.result = null; this.toAct = -1;
    if (this.occupied < this.cfg.minPlayers) { this.phase = 'waiting'; this.dealer = -1; this.handNo = 0; return { started: false, busted }; }
    this.handNo++;
    const n = this.seats.length;
    // the dealer role passes to the next seat every round
    let d = this.dealer;
    for (let k = 1; k <= n; k++) { const j = (d + k + n) % n; if (this.seats[j]) { d = j; break; } }
    this.dealer = d;
    for (const s of this.seats) if (s) s.inRound = true;
    this.deck = shuffle(newDeck(), this.rng);
    this.phase = 'betting';
    return { started: true, busted };
  }

  act(userId: string, a: PdAction): string | null {
    const i = this.seatOf(userId);
    const s = i >= 0 ? this.seats[i]! : null;
    if (!s || !s.inRound) return 'not_seated';
    switch (a.type) {
      case 'bet': {
        if (this.phase !== 'betting') return 'not_betting';
        if (i === this.dealer) return 'dealer_no_bet';
        const amount = Math.floor(Number(a.amount));
        const normal = (this.cfg.bets as readonly number[]).includes(amount) && amount <= s.chips;
        const allIn = s.chips < this.cfg.bets[0] && amount === s.chips && amount > 0; // too poor for the smallest bet: all in
        if (!normal && !allIn) return 'bad_amount';
        s.bet = amount; s.timeouts = 0;
        this.maybeDeal();
        return null;
      }
      case 'draw':
      case 'stay': {
        if (this.phase !== 'acting') return 'no_hand';
        if (i !== this.toAct) return 'not_your_turn';
        if (a.type === 'draw') {
          if (s.cards.length !== 2) return 'cannot_draw';
          s.cards.push(this.deck.pop()!);
        }
        s.done = true; s.timeouts = 0;
        this.advance();
        return null;
      }
      default: return 'bad_action';
    }
  }

  /** The clock ran out. Betting: everybody who has not bet bets the minimum. Acting: the player to act stays. */
  timeout(): { timedOut: string[]; stood: string[] } {
    const timedOut: string[] = [], stood: string[] = [];
    if (this.phase === 'betting') {
      for (const { s } of this.punters()) if (!s.bet) { s.bet = Math.min(this.cfg.bets[0], Math.max(s.chips, 1)); timedOut.push(s.userId); }
    } else if (this.phase === 'acting' && this.toAct >= 0) {
      const s = this.seats[this.toAct]!;
      timedOut.push(s.userId);
      s.done = true;
    } else return { timedOut, stood };
    for (const u of timedOut) {
      const s = this.seats[this.seatOf(u)];
      if (s && ++s.timeouts >= this.cfg.maxTimeouts) stood.push(u);
    }
    if (this.phase === 'betting') this.maybeDeal(); else this.advance();
    for (const u of stood) this.stand(u);
    return { timedOut, stood };
  }

  private maybeDeal() {
    if (this.phase !== 'betting') return;
    const ps = this.punters();
    if (ps.length === 0) return this.cancelRound(); // everybody but the dealer left
    if (ps.some((x) => !x.s.bet)) return;
    const order = this.order();
    for (let r = 0; r < 2; r++) for (const j of order) this.seats[j]!.cards.push(this.deck.pop()!);
    for (const j of order) { if (pdEvaluate(this.seats[j]!.cards).category.startsWith('pok')) this.seats[j]!.done = true; }
    this.phase = 'acting';
    const dealerPok = this.seats[this.dealer]!.done;
    this.toAct = dealerPok ? -1 : this.nextActor(this.dealer);
    this.advance(true);
  }

  /** Seats in the round, starting left of the dealer; the dealer comes last. */
  private order(): number[] {
    const n = this.seats.length, out: number[] = [];
    for (let k = 1; k <= n; k++) { const j = (this.dealer + k) % n; if (this.seats[j]?.inRound) out.push(j); }
    return out;
  }
  private nextActor(from: number): number {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k) % n;
      const s = this.seats[j];
      if (s?.inRound && !s.done) return j;
    }
    return -1;
  }

  private advance(fresh = false) {
    if (this.phase !== 'acting') return;
    const dealer = this.seats[this.dealer]!;
    if (dealer.done && dealer.cards.length && pdEvaluate(dealer.cards).category.startsWith('pok')) return this.showdown(); // a dealer pok ends the round
    const nextPunter = this.punters().find((x) => !x.s.done);
    if (nextPunter) {
      // punters go in seat order starting left of the dealer; keep the current one if they have not acted yet
      const cur = this.toAct >= 0 ? this.seats[this.toAct] : null;
      this.toAct = fresh || !cur || cur.done || this.toAct === this.dealer ? this.nextActor(this.dealer) : this.toAct;
      return;
    }
    if (!dealer.done) { this.toAct = this.dealer; return; }
    this.showdown();
  }

  private maybeShowdown() {
    if (this.phase === 'acting') this.advance();
  }

  private showdown() {
    this.phase = 'showdown';
    this.toAct = -1;
    const dealer = this.seats[this.dealer]!;
    const dh = pdEvaluate(dealer.cards);
    const lines: PdResultLine[] = [];
    // 1) punters who lose pay the dealer, 2) the dealer pays the winners in seat order while chips last
    const order = this.order().filter((j) => j !== this.dealer);
    let dealerDelta = 0;
    for (const j of order) {
      const s = this.seats[j]!;
      const h = pdEvaluate(s.cards);
      const outcome = h.strength > dh.strength ? 'win' : h.strength < dh.strength ? 'lose' : 'tie';
      lines.push({ seat: j, userId: s.userId, bet: s.bet, delta: 0, outcome, hand: h.name });
      if (outcome === 'lose') {
        const pay = Math.min(s.bet * dh.mult, s.chips);
        s.chips -= pay; dealer.chips += pay; dealerDelta += pay;
        lines[lines.length - 1].delta = -pay;
      }
    }
    for (const line of lines) {
      if (line.outcome !== 'win') continue;
      const s = this.seats[line.seat]!;
      const pay = Math.min(line.bet * pdEvaluate(s.cards).mult, dealer.chips);
      dealer.chips -= pay; s.chips += pay; dealerDelta -= pay;
      line.delta = pay;
    }
    this.result = { dealer: { seat: this.dealer, userId: dealer.userId, hand: dh.name, delta: dealerDelta }, lines };
  }

  view(userId?: string): PdView {
    const reveal = this.phase === 'showdown';
    return {
      game: 'pokdeng', phase: this.phase, dealer: this.dealer, toAct: this.toAct, bets: this.cfg.bets, result: this.result, handNo: this.handNo,
      seats: this.seats.map((s, i) => {
        if (!s) return null;
        const mine = s.userId === userId;
        const pok = s.cards.length >= 2 && pdEvaluate(s.cards).category.startsWith('pok');
        const up = s.cards.length > 0 && (reveal || mine || pok);
        return {
          userId: s.userId, chips: s.chips, bet: s.bet, inRound: s.inRound, isDealer: i === this.dealer, done: s.done, count: s.cards.length,
          cards: up ? s.cards.slice() : s.cards.map(() => -1),
          hand: up && s.cards.length ? pdEvaluate(s.cards).name : null,
        };
      }),
    };
  }
}
