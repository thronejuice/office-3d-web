import { useEffect, useRef, useState } from 'react';
import { GAME_LABEL, sqFile, sqRank, squareName, type ChessView, type GameState, type PromoPiece } from '@office3d/shared';
import { T } from '../strings.th';
import { seatedTable, useStore } from '../store';
import { sendGameAct, sendGameSit, sendGameStand } from '../game/net';
import { PieceIcon, pieceLabel } from './ChessPieces';

const PROMO: { p: PromoPiece; label: string }[] = [
  { p: 'q', label: 'ราชินี' }, { p: 'r', label: 'เรือ' }, { p: 'b', label: 'โคน' }, { p: 'n', label: 'ม้า' },
];

/** Chess table panel: a board you click on, move list and the usual game buttons. Read-only for spectators. */
export function ChessPanel({ g, view }: { g: GameState; view: ChessView }) {
  const selfId = useStore((s) => s.selfId);
  const people = useStore((s) => s.people);
  const games = useStore((s) => s.games);
  const set = useStore((s) => s.set);
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [focusIdx, setFocusIdx] = useState<number | null>(null); // roving tabindex: the board is one tab stop, arrows move inside it
  const boardRef = useRef<HTMLDivElement>(null);

  const mySeat = view.seats.findIndex((s) => s && s.userId === selfId);
  const me = mySeat >= 0 ? view.seats[mySeat]! : null;
  const myColor = view.phase === 'playing' || view.phase === 'over' ? me?.color ?? null : null;
  const myTurn = view.phase === 'playing' && !!myColor && view.turn === myColor;
  const seated = seatedTable({ games, selfId });
  const flip = myColor === 'b';
  const nameOf = (id: string) => people[id]?.user.displayName ?? '—';

  useEffect(() => { setSel(null); setPromo(null); }, [view.history.length, view.phase, view.handNo]);
  useEffect(() => { if (!confirmResign) return; const t = setTimeout(() => setConfirmResign(false), 3000); return () => clearTimeout(t); }, [confirmResign]);

  const click = (s: number) => {
    if (!myTurn) return;
    if (sel !== null && view.legal[sel]?.includes(s)) {
      const pawn = view.board[sel].toUpperCase() === 'P';
      if (pawn && (sqRank(s) === 0 || sqRank(s) === 7)) return setPromo({ from: sel, to: s });
      sendGameAct({ type: 'move', from: sel, to: s });
      return setSel(null);
    }
    setSel(view.legal[s] ? s : null);
  };

  const order = Array.from({ length: 64 }, (_, i) => i).map((i) => {
    const r = Math.floor(i / 8), f = i % 8;
    return flip ? (r) * 8 + (7 - f) : (7 - r) * 8 + f; // top-left of the screen first
  });

  const defaultIdx = Math.max(0, order.findIndex((s) => view.legal[s]));
  const tabIdx = focusIdx ?? defaultIdx;
  const onBoardKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
    let next = tabIdx;
    if (e.key in step) {
      const col = tabIdx % 8, d = step[e.key];
      if ((d === -1 && col === 0) || (d === 1 && col === 7)) return e.preventDefault();
      next = tabIdx + d;
      if (next < 0 || next > 63) return e.preventDefault();
    } else if (e.key === 'Home') next = tabIdx - (tabIdx % 8);
    else if (e.key === 'End') next = tabIdx - (tabIdx % 8) + 7;
    else return;
    e.preventDefault();
    setFocusIdx(next);
    (boardRef.current?.children[next] as HTMLElement | undefined)?.focus();
  };

  const white = view.seats.find((s) => s?.color === 'w'), black = view.seats.find((s) => s?.color === 'b');
  const status = view.phase === 'waiting' ? T.chessWaiting
    : view.phase === 'over' ? ''
    : `${myTurn ? T.gameYourTurn : T.gameTurnOf(view.turn === 'w' ? T.chessWhite : T.chessBlack)}${view.check ? ` · ${T.chessInCheck}` : ''}`;
  const res = view.result;
  const resultText = res
    ? res.winner ? `${T.gameWins(nameOf(res.winner === 'w' ? res.white : res.black), 0).replace(/ 0$/, '')} — ${T.chessReasons[res.reason]}` : T.chessReasons[res.reason]
    : '';
  const free = view.seats.some((s) => !s);
  const opponentOffered = !!view.drawOffer && view.drawOffer !== selfId;
  const iOffered = view.drawOffer === selfId;

  const PlayerBar = ({ s, c }: { s: typeof white; c: 'w' | 'b' }) => (
    <div className={`chess-player ${view.phase === 'playing' && view.turn === c ? 'turn' : ''}`}>
      <span className={`piece-chip ${c === 'w' ? 'white' : 'black'}`} aria-hidden="true" />
      <strong>{s ? nameOf(s.userId) : T.gameEmpty}</strong>
      <span className="muted small">{c === 'w' ? T.chessWhite : T.chessBlack}</span>
    </div>
  );

  return (
    <section className="gamepanel chess" aria-label={GAME_LABEL.chess}>
      <header className="row">
        <h2 className="grow">{GAME_LABEL.chess}</h2>
        <span className="muted small">{status}</span>
        <button className="ghost" onClick={() => set({ openTable: null })} aria-label={T.gameClose}>✕</button>
      </header>
      <p className="sr-only" role="status">{myTurn ? T.gameYourTurn : ''}</p>

      <PlayerBar s={flip ? white : black} c={flip ? 'w' : 'b'} />
      <div ref={boardRef} className={`board8 ${flip ? 'flip' : ''}`} role="grid" aria-label={T.chessBoard} onKeyDown={onBoardKey}>
        {order.map((s, idx) => {
          const p = view.board[s];
          const dark = (sqFile(s) + sqRank(s)) % 2 === 0;
          const targets = sel !== null ? view.legal[sel] ?? [] : [];
          const cls = ['sq', dark ? 'dark' : 'light', sel === s ? 'sel' : '', targets.includes(s) ? (p ? 'hit' : 'hint') : '',
            view.lastMove && (view.lastMove.from === s || view.lastMove.to === s) ? 'last' : '',
            view.check && p && p.toUpperCase() === 'K' && (p === 'K') === (view.turn === 'w') ? 'check' : ''].filter(Boolean).join(' ');
          return (
            <button key={s} className={cls} role="gridcell" tabIndex={idx === tabIdx ? 0 : -1} aria-disabled={!myTurn} onClick={() => click(s)} onFocus={() => setFocusIdx(idx)}
              aria-label={`${squareName(s)} ${p ? pieceLabel(p) : T.chessEmptySquare}${targets.includes(s) ? ` ${T.chessCanMoveHere}` : ''}${cls.includes('check') ? ` ${T.chessInCheck}` : ''}`}>
              <PieceIcon piece={p} />
            </button>
          );
        })}
      </div>
      <PlayerBar s={flip ? black : white} c={flip ? 'b' : 'w'} />

      {promo && (
        <div className="row promo" role="group" aria-label={T.chessPromote}>
          {PROMO.map((x) => (
            <button key={x.p} onClick={() => { sendGameAct({ type: 'move', from: promo.from, to: promo.to, promo: x.p }); setPromo(null); }}>{x.label}</button>
          ))}
        </div>
      )}

      {res && <p className="result small" role="status">{resultText} · {T.gameNextHand}</p>}
      {opponentOffered && view.phase === 'playing' && (
        <div className="row banner-lite" role="alert">
          <span className="grow">{T.chessDrawOffered}</span>
          <button className="primary" onClick={() => sendGameAct({ type: 'acceptDraw' })}>{T.chessAccept}</button>
          <button onClick={() => sendGameAct({ type: 'declineDraw' })}>{T.chessDecline}</button>
        </div>
      )}

      {view.history.length > 0 && <p className="small muted moves" aria-label={T.chessMoves}>{view.history.slice(-8).join('  ')}</p>}

      <div className="gamefoot">
        <div className="row end">
          <span className="muted small grow">{me ? '' : T.gameWatching}</span>
          {me && view.phase === 'playing' && (
            <>
              <button disabled={iOffered || opponentOffered} onClick={() => sendGameAct({ type: 'offerDraw' })}>{iOffered ? T.chessOfferSent : T.chessOfferDraw}</button>
              <button className={confirmResign ? 'danger' : ''} onClick={() => (confirmResign ? sendGameAct({ type: 'resign' }) : setConfirmResign(true))}>{confirmResign ? T.chessResignConfirm : T.chessResign}</button>
            </>
          )}
          {me
            ? <button onClick={() => sendGameStand()}>{view.phase === 'playing' ? T.chessStandForfeit : T.gameStand}</button>
            : <button className="primary" disabled={!free || !!seated} onClick={() => sendGameSit(g.tableId)}>{T.gameSit}</button>}
        </div>
      </div>
    </section>
  );
}
