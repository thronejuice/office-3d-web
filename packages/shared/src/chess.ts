// Chess rules: full legal move generation (castling, en passant, promotion), check / mate / draw detection,
// and a two-seat table state machine. Pure data, no I/O. Squares are 0..63 with index = rank * 8 + file,
// rank 0 = White's back rank, file 0 = the a-file.

export type Color = 'w' | 'b';
/** Uppercase = white, lowercase = black, '' = empty. */
export type Piece = '' | 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromoPiece = 'q' | 'r' | 'b' | 'n';
export interface Move { from: number; to: number; promo?: PromoPiece }

export interface Position {
  board: Piece[];
  turn: Color;
  castle: { K: boolean; Q: boolean; k: boolean; q: boolean };
  ep: number; // square a pawn may capture onto en passant, or -1
  halfmove: number; // plies since a capture or pawn move
  fullmove: number;
}

export const sq = (file: number, rank: number) => rank * 8 + file;
export const sqFile = (s: number) => s & 7;
export const sqRank = (s: number) => s >> 3;
export const squareName = (s: number) => 'abcdefgh'[sqFile(s)] + (sqRank(s) + 1);
export const colorOf = (p: Piece): Color | null => (p === '' ? null : p === p.toUpperCase() ? 'w' : 'b');

const BACK: Piece[] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

export function startPosition(): Position {
  const board: Piece[] = new Array(64).fill('');
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = BACK[f];
    board[sq(f, 1)] = 'P';
    board[sq(f, 6)] = 'p';
    board[sq(f, 7)] = BACK[f].toLowerCase() as Piece;
  }
  return { board, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1, halfmove: 0, fullmove: 1 };
}

/** Parse the board part and the rest of a FEN string (used by tests). */
export function fromFen(fen: string): Position {
  const [rows, turn, cas, ep, half, full] = fen.split(' ');
  const board: Piece[] = new Array(64).fill('');
  rows.split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else board[sq(f++, 7 - i)] = ch as Piece;
    }
  });
  return {
    board, turn: turn === 'b' ? 'b' : 'w',
    castle: { K: cas.includes('K'), Q: cas.includes('Q'), k: cas.includes('k'), q: cas.includes('q') },
    ep: ep && ep !== '-' ? sq('abcdefgh'.indexOf(ep[0]), Number(ep[1]) - 1) : -1,
    halfmove: Number(half ?? 0), fullmove: Number(full ?? 1),
  };
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Is `s` attacked by any piece of colour `by`? */
export function isAttacked(board: Piece[], s: number, by: Color): boolean {
  const f = sqFile(s), r = sqRank(s);
  const at = (ff: number, rr: number): Piece | null => (ff < 0 || ff > 7 || rr < 0 || rr > 7 ? null : board[sq(ff, rr)]);
  const own = (p: Piece | null, kind: string) => p !== null && p !== '' && colorOf(p) === by && p.toUpperCase() === kind;
  const pr = by === 'w' ? r - 1 : r + 1; // a white pawn attacks upward, so it stands one rank below the target
  if (own(at(f - 1, pr), 'P') || own(at(f + 1, pr), 'P')) return true;
  for (const [df, dr] of KNIGHT) if (own(at(f + df, r + dr), 'N')) return true;
  for (const [df, dr] of KING) if (own(at(f + df, r + dr), 'K')) return true;
  for (const [dirs, kinds] of [[ROOK_DIRS, 'RQ'], [BISHOP_DIRS, 'BQ']] as const)
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr;
      while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
        const p = board[sq(ff, rr)];
        if (p !== '') { if (colorOf(p) === by && kinds.includes(p.toUpperCase())) return true; break; }
        ff += df; rr += dr;
      }
    }
  return false;
}

const findKing = (board: Piece[], c: Color) => board.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (pos: Position, c: Color = pos.turn) => {
  const k = findKing(pos.board, c);
  return k >= 0 && isAttacked(pos.board, k, c === 'w' ? 'b' : 'w');
};

function pseudoMoves(pos: Position): Move[] {
  const { board, turn } = pos;
  const out: Move[] = [];
  const enemy = turn === 'w' ? 'b' : 'w';
  const push = (from: number, to: number, promo = false) => {
    if (promo) for (const p of ['q', 'r', 'b', 'n'] as const) out.push({ from, to, promo: p });
    else out.push({ from, to });
  };
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p === '' || colorOf(p) !== turn) continue;
    const f = sqFile(s), r = sqRank(s);
    const kind = p.toUpperCase();
    if (kind === 'P') {
      const dir = turn === 'w' ? 1 : -1, start = turn === 'w' ? 1 : 6, last = turn === 'w' ? 7 : 0;
      const one = sq(f, r + dir);
      if (r + dir >= 0 && r + dir < 8 && board[one] === '') {
        push(s, one, r + dir === last);
        if (r === start && board[sq(f, r + 2 * dir)] === '') push(s, sq(f, r + 2 * dir));
      }
      for (const df of [-1, 1]) {
        const ff = f + df, rr = r + dir;
        if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        const t = sq(ff, rr);
        if ((board[t] !== '' && colorOf(board[t]) === enemy) || t === pos.ep) push(s, t, rr === last);
      }
    } else if (kind === 'N' || kind === 'K') {
      for (const [df, dr] of kind === 'N' ? KNIGHT : KING) {
        const ff = f + df, rr = r + dr;
        if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        const t = sq(ff, rr);
        if (board[t] === '' || colorOf(board[t]) === enemy) push(s, t);
      }
      if (kind === 'K') {
        const home = turn === 'w' ? 0 : 7;
        if (s === sq(4, home) && !isAttacked(board, s, enemy)) {
          const ks = turn === 'w' ? pos.castle.K : pos.castle.k, qs = turn === 'w' ? pos.castle.Q : pos.castle.q;
          const rook = turn === 'w' ? 'R' : 'r';
          if (ks && board[sq(7, home)] === rook && board[sq(5, home)] === '' && board[sq(6, home)] === '' && !isAttacked(board, sq(5, home), enemy) && !isAttacked(board, sq(6, home), enemy)) push(s, sq(6, home));
          if (qs && board[sq(0, home)] === rook && board[sq(1, home)] === '' && board[sq(2, home)] === '' && board[sq(3, home)] === '' && !isAttacked(board, sq(3, home), enemy) && !isAttacked(board, sq(2, home), enemy)) push(s, sq(2, home));
        }
      }
    } else {
      const dirs = kind === 'R' ? ROOK_DIRS : kind === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS];
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const t = sq(ff, rr);
          if (board[t] === '') push(s, t);
          else { if (colorOf(board[t]) === enemy) push(s, t); break; }
          ff += df; rr += dr;
        }
      }
    }
  }
  return out;
}

/** Apply a (legal) move and return the new position. */
export function applyMove(pos: Position, m: Move): Position {
  const board = pos.board.slice();
  const p = board[m.from];
  const kind = p.toUpperCase();
  const castle = { ...pos.castle };
  let ep = -1;
  let capture = board[m.to] !== '';
  board[m.from] = '';
  if (kind === 'P' && m.to === pos.ep && sqFile(m.from) !== sqFile(m.to) && board[m.to] === '') {
    board[sq(sqFile(m.to), sqRank(m.from))] = ''; // en passant removes the pawn beside us
    capture = true;
  }
  board[m.to] = m.promo ? (pos.turn === 'w' ? (m.promo.toUpperCase() as Piece) : m.promo) : p;
  if (kind === 'P' && Math.abs(sqRank(m.to) - sqRank(m.from)) === 2) ep = sq(sqFile(m.from), (sqRank(m.from) + sqRank(m.to)) / 2);
  if (kind === 'K') {
    if (pos.turn === 'w') { castle.K = false; castle.Q = false; } else { castle.k = false; castle.q = false; }
    if (Math.abs(sqFile(m.to) - sqFile(m.from)) === 2) {
      const r = sqRank(m.from);
      if (sqFile(m.to) === 6) { board[sq(5, r)] = board[sq(7, r)]; board[sq(7, r)] = ''; }
      else { board[sq(3, r)] = board[sq(0, r)]; board[sq(0, r)] = ''; }
    }
  }
  // a rook moving away or being captured loses that side's right
  for (const s of [m.from, m.to]) {
    if (s === sq(0, 0)) castle.Q = false;
    if (s === sq(7, 0)) castle.K = false;
    if (s === sq(0, 7)) castle.q = false;
    if (s === sq(7, 7)) castle.k = false;
  }
  return { board, turn: pos.turn === 'w' ? 'b' : 'w', castle, ep, halfmove: kind === 'P' || capture ? 0 : pos.halfmove + 1, fullmove: pos.fullmove + (pos.turn === 'b' ? 1 : 0) };
}

export function legalMoves(pos: Position): Move[] {
  return pseudoMoves(pos).filter((m) => !inCheck(applyMove(pos, m), pos.turn));
}

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  return moves.reduce((n, m) => n + perft(applyMove(pos, m), depth - 1), 0);
}

export function insufficientMaterial(board: Piece[]): boolean {
  const minors: { p: Piece; s: number }[] = [];
  for (let s = 0; s < 64; s++) {
    const p = board[s];
    if (p === '' || p === 'K' || p === 'k') continue;
    if (p === 'N' || p === 'n' || p === 'B' || p === 'b') minors.push({ p, s });
    else return false; // any pawn, rook or queen can still mate
  }
  if (minors.length <= 1) return true;
  // only bishops, all on the same colour of square: no mate possible
  return minors.every((x) => x.p.toUpperCase() === 'B') && new Set(minors.map((x) => (sqFile(x.s) + sqRank(x.s)) % 2)).size === 1;
}

/** Identifies a position for the repetition rule (board, side to move, castling, en passant that can really be taken). */
export function positionKey(pos: Position): string {
  const ep = pos.ep >= 0 && legalMoves(pos).some((m) => m.to === pos.ep && pos.board[m.from].toUpperCase() === 'P') ? pos.ep : -1;
  const c = pos.castle;
  return `${pos.board.map((p) => p || '.').join('')} ${pos.turn} ${c.K ? 'K' : ''}${c.Q ? 'Q' : ''}${c.k ? 'k' : ''}${c.q ? 'q' : ''} ${ep}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Two-seat table
// ---------------------------------------------------------------------------------------------------------------------

export type ChessReason = 'checkmate' | 'stalemate' | 'resign' | 'left' | 'agreement' | 'insufficient' | 'repetition' | 'fifty';
export interface ChessResult { winner: Color | null; reason: ChessReason; white: string; black: string }
export type ChessAction =
  | { type: 'move'; from: number; to: number; promo?: PromoPiece }
  | { type: 'resign' }
  | { type: 'offerDraw' }
  | { type: 'acceptDraw' }
  | { type: 'declineDraw' };
export type ChessPhase = 'waiting' | 'playing' | 'over';

export interface ChessView {
  game: 'chess';
  phase: ChessPhase;
  /** Seat order is fixed; `color` is who plays White this game. */
  seats: ({ userId: string; color: Color | null } | null)[];
  board: Piece[];
  turn: Color;
  check: boolean;
  lastMove: { from: number; to: number } | null;
  /** Legal moves, only for the player whose turn it is (from square -> target squares). */
  legal: Record<number, number[]>;
  drawOffer: string | null; // userId who offered
  history: string[]; // "e2-e4"
  result: ChessResult | null;
  handNo: number;
}

export class ChessTable {
  seats: (string | null)[] = [null, null];
  phase: ChessPhase = 'waiting';
  pos: Position = startPosition();
  white = 0; // seat index playing White this game
  lastMove: { from: number; to: number } | null = null;
  history: string[] = [];
  drawOffer: string | null = null;
  result: ChessResult | null = null;
  handNo = 0;
  private seen = new Map<string, number>();

  get occupied() { return this.seats.filter(Boolean).length; }
  seatOf(userId: string) { return this.seats.findIndex((s) => s === userId); }
  private userOf(c: Color) { return this.seats[c === 'w' ? this.white : 1 - this.white]!; }
  private colorOfUser(userId: string): Color | null {
    const i = this.seatOf(userId);
    return i < 0 || this.phase !== 'playing' ? null : i === this.white ? 'w' : 'b';
  }

  sit(userId: string): number {
    const have = this.seatOf(userId);
    if (have >= 0) return have;
    const free = this.seats.findIndex((s) => !s);
    if (free < 0) return -1;
    this.seats[free] = userId;
    return free;
  }

  /** Standing up in the middle of a game forfeits it. */
  stand(userId: string): boolean {
    const i = this.seatOf(userId);
    if (i < 0) return false;
    if (this.phase === 'playing') this.end(this.colorOfUser(userId) === 'w' ? 'b' : 'w', 'left');
    this.seats[i] = null;
    if (this.phase === 'waiting') this.reset();
    if (this.occupied === 0) { this.phase = 'waiting'; this.result = null; this.handNo = 0; this.reset(); } // an empty table starts fresh, even straight after a game
    return true;
  }

  private reset() {
    this.pos = startPosition(); this.lastMove = null; this.history = []; this.drawOffer = null; this.seen.clear();
  }

  /** Start a game when two players are seated (colours swap every game). Returns true if one started. */
  tryStart(): boolean {
    if (this.phase === 'playing') return false;
    if (this.occupied < 2) { this.phase = 'waiting'; this.result = null; this.handNo = 0; this.reset(); return false; } // an empty table starts fresh: the first seat is White
    this.handNo++;
    this.white = this.handNo === 1 ? 0 : 1 - this.white;
    this.reset();
    this.result = null;
    this.phase = 'playing';
    this.seen.set(positionKey(this.pos), 1);
    return true;
  }

  private end(winner: Color | null, reason: ChessReason) {
    this.phase = 'over';
    this.drawOffer = null;
    this.result = { winner, reason, white: this.seats[this.white] ?? '', black: this.seats[1 - this.white] ?? '' };
  }

  /** Returns an error code or null. */
  act(userId: string, a: ChessAction): string | null {
    if (this.phase !== 'playing') return 'no_game';
    const me = this.colorOfUser(userId);
    if (!me) return 'not_seated';
    switch (a.type) {
      case 'resign': this.end(me === 'w' ? 'b' : 'w', 'resign'); return null;
      case 'offerDraw': this.drawOffer = userId; return null;
      case 'declineDraw': if (this.drawOffer && this.drawOffer !== userId) this.drawOffer = null; return null;
      case 'acceptDraw':
        if (!this.drawOffer || this.drawOffer === userId) return 'no_offer';
        this.end(null, 'agreement'); return null;
      case 'move': {
        if (this.pos.turn !== me) return 'not_your_turn';
        const from = Number(a.from), to = Number(a.to);
        const m = legalMoves(this.pos).find((x) => x.from === from && x.to === to && (x.promo ?? '') === (a.promo ?? (x.promo ? 'q' : '')));
        if (!m) return 'illegal_move';
        this.history.push(`${squareName(m.from)}-${squareName(m.to)}${m.promo ? '=' + m.promo.toUpperCase() : ''}`);
        this.pos = applyMove(this.pos, m);
        this.lastMove = { from: m.from, to: m.to };
        this.drawOffer = null; // a move declines any pending offer
        const key = positionKey(this.pos);
        this.seen.set(key, (this.seen.get(key) ?? 0) + 1);
        const moves = legalMoves(this.pos);
        const side = this.pos.turn;
        if (moves.length === 0) this.end(inCheck(this.pos) ? (side === 'w' ? 'b' : 'w') : null, inCheck(this.pos) ? 'checkmate' : 'stalemate');
        else if (insufficientMaterial(this.pos.board)) this.end(null, 'insufficient');
        else if ((this.seen.get(key) ?? 0) >= 3) this.end(null, 'repetition');
        else if (this.pos.halfmove >= 100) this.end(null, 'fifty');
        return null;
      }
      default: return 'bad_action';
    }
  }

  view(userId?: string): ChessView {
    const me = userId ? this.colorOfUser(userId) : null;
    const legal: Record<number, number[]> = {};
    if (this.phase === 'playing' && me && this.pos.turn === me)
      for (const m of legalMoves(this.pos)) (legal[m.from] ??= []).includes(m.to) || legal[m.from].push(m.to);
    return {
      game: 'chess', phase: this.phase,
      seats: this.seats.map((u, i) => (u ? { userId: u, color: this.phase === 'waiting' ? null : i === this.white ? 'w' : 'b' } : null)),
      board: this.pos.board.slice(), turn: this.pos.turn, check: this.phase !== 'waiting' && inCheck(this.pos),
      lastMove: this.lastMove, legal, drawOffer: this.drawOffer, history: this.history.slice(-40), result: this.result, handNo: this.handNo,
    };
  }
}
