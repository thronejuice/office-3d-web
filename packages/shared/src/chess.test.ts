import { describe, expect, it } from 'vitest';
import { ChessTable, applyMove, fromFen, insufficientMaterial, inCheck, legalMoves, perft, sq, startPosition, type Move } from './chess';

const S = (name: string) => sq('abcdefgh'.indexOf(name[0]), Number(name[1]) - 1);
const mv = (a: string, b: string, promo?: Move['promo']): Move => ({ from: S(a), to: S(b), promo });
const play = (t: ChessTable, who: string, a: string, b: string, promo?: Move['promo']) => t.act(who, { type: 'move', from: S(a), to: S(b), promo });

describe('move generation (perft)', () => {
  it('start position', () => {
    const p = startPosition();
    expect([1, 2, 3, 4].map((d) => perft(p, d))).toEqual([20, 400, 8902, 197281]);
  });
  it('kiwipete (castling, en passant, pins, promotions)', () => {
    const p = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect([1, 2, 3].map((d) => perft(p, d))).toEqual([48, 2039, 97862]);
  });
  it('endgame with en-passant pins', () => {
    const p = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect([1, 2, 3, 4].map((d) => perft(p, d))).toEqual([14, 191, 2812, 43238]);
  });
  it('promotions and castling out of / through check', () => {
    expect([1, 2, 3].map((d) => perft(fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1'), d))).toEqual([6, 264, 9467]);
    expect([1, 2, 3].map((d) => perft(fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8'), d))).toEqual([44, 1486, 62379]);
  });
});

describe('special moves', () => {
  it('castles both ways and moves the rook', () => {
    const p = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const ks = applyMove(p, mv('e1', 'g1'));
    expect(ks.board[S('f1')]).toBe('R');
    expect(ks.board[S('h1')]).toBe('');
    const qs = applyMove(p, mv('e1', 'c1'));
    expect(qs.board[S('d1')]).toBe('R');
    expect(qs.castle.K || qs.castle.Q).toBe(false);
  });
  it('cannot castle through an attacked square or out of check', () => {
    const through = fromFen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1'); // f2 rook attacks f1
    expect(legalMoves(through).some((m) => m.from === S('e1') && m.to === S('g1'))).toBe(false);
    const inChk = fromFen('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1');
    expect(legalMoves(inChk).some((m) => m.from === S('e1') && Math.abs(m.to - m.from) === 2)).toBe(false);
  });
  it('en passant captures the passed pawn, and only immediately', () => {
    const p = fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const after = applyMove(p, mv('e5', 'd6'));
    expect(after.board[S('d5')]).toBe('');
    expect(after.board[S('d6')]).toBe('P');
    const later = fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1');
    expect(legalMoves(later).some((m) => m.to === S('d6'))).toBe(false);
  });
  it('promotes to the chosen piece', () => {
    const p = fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    expect(applyMove(p, mv('a7', 'a8', 'n')).board[S('a8')]).toBe('N');
    expect(legalMoves(p).filter((m) => m.from === S('a7')).length).toBe(4);
  });
});

describe('end of game detection', () => {
  it('knows check, and insufficient material', () => {
    expect(inCheck(fromFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(fromFen('4k3/8/8/8/8/8/8/3BK3 w - - 0 1').board)).toBe(true);
    expect(insufficientMaterial(fromFen('4k3/8/8/8/8/8/8/3RK3 w - - 0 1').board)).toBe(false);
    expect(insufficientMaterial(fromFen('1b2k3/8/8/8/8/8/8/3BK3 w - - 0 1').board)).toBe(false); // opposite-coloured bishops: mate is still possible
    expect(insufficientMaterial(fromFen('2b1k3/8/8/8/8/8/8/3BK3 w - - 0 1').board)).toBe(true); // same colour: it is not
  });
});

describe('table', () => {
  const two = () => { const t = new ChessTable(); t.sit('a'); t.sit('b'); t.tryStart(); return t; };

  it('needs two players; the first game gives White to the first seat, then colours swap', () => {
    const t = new ChessTable();
    t.sit('a');
    expect(t.tryStart()).toBe(false);
    t.sit('b');
    expect(t.tryStart()).toBe(true);
    expect(t.view('a').seats[0]!.color).toBe('w');
    t.act('a', { type: 'resign' });
    expect(t.phase).toBe('over');
    expect(t.tryStart()).toBe(true);
    expect(t.view('a').seats[0]!.color).toBe('b');
  });

  it('colours restart from the first seat once the table has been empty', () => {
    const t = new ChessTable();
    t.sit('a'); t.sit('b'); t.tryStart();
    t.act('a', { type: 'resign' });
    t.stand('a'); t.stand('b');
    t.tryStart(); // nobody left: back to waiting
    t.sit('c'); t.sit('d');
    expect(t.tryStart()).toBe(true);
    expect(t.view('c').seats[0]!.color).toBe('w');
  });

  it('a table that empties right after a game still starts fresh for the next pair', () => {
    const t = new ChessTable();
    t.sit('a'); t.sit('b'); t.tryStart();
    t.act('a', { type: 'resign' }); // phase over, the 8 s pause has not elapsed
    t.stand('a'); t.stand('b');
    t.sit('c'); t.sit('d');
    expect(t.tryStart()).toBe(true);
    expect(t.view('c').seats[0]!.color).toBe('w');
  });

  it('only the player to move can move, and only legally', () => {
    const t = two();
    expect(play(t, 'b', 'e7', 'e5')).toBe('not_your_turn');
    expect(play(t, 'a', 'e2', 'e5')).toBe('illegal_move');
    expect(play(t, 'a', 'e2', 'e4')).toBeNull();
    expect(t.view('b').legal[S('e7')]).toEqual([S('e6'), S('e5')]);
    expect(Object.keys(t.view('a').legal)).toEqual([]); // not a's turn
  });

  it("fool's mate is checkmate and the winner is recorded", () => {
    const t = two();
    play(t, 'a', 'f2', 'f3'); play(t, 'b', 'e7', 'e5'); play(t, 'a', 'g2', 'g4');
    expect(play(t, 'b', 'd8', 'h4')).toBeNull();
    expect(t.phase).toBe('over');
    expect(t.result).toMatchObject({ winner: 'b', reason: 'checkmate', white: 'a', black: 'b' });
  });

  it('threefold repetition is a draw', () => {
    const t = two();
    for (let i = 0; i < 2; i++) { play(t, 'a', 'g1', 'f3'); play(t, 'b', 'g8', 'f6'); play(t, 'a', 'f3', 'g1'); play(t, 'b', 'f6', 'g8'); }
    expect(t.phase).toBe('over');
    expect(t.result).toMatchObject({ winner: null, reason: 'repetition' });
  });

  it('a draw offer needs the other player to accept; making a move declines it', () => {
    const t = two();
    play(t, 'a', 'e2', 'e4');
    t.act('b', { type: 'offerDraw' });
    expect(t.act('b', { type: 'acceptDraw' })).toBe('no_offer');
    expect(t.view('a').drawOffer).toBe('b');
    expect(t.act('a', { type: 'acceptDraw' })).toBeNull();
    expect(t.result).toMatchObject({ winner: null, reason: 'agreement' });
    const u = two();
    u.act('a', { type: 'offerDraw' });
    play(u, 'a', 'e2', 'e4');
    expect(u.drawOffer).toBeNull();
  });

  it('standing up mid-game forfeits it', () => {
    const t = two();
    t.stand('a');
    expect(t.result).toMatchObject({ winner: 'b', reason: 'left' });
    expect(t.seatOf('a')).toBe(-1);
  });

  it('a pawn reaching the last rank without a choice becomes a queen', () => {
    const t = two();
    t.pos = fromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(play(t, 'a', 'a7', 'a8')).toBeNull();
    expect(t.pos.board[S('a8')]).toBe('Q');
  });
});
