import { useEffect, useState } from 'react';
import { BINGO, BINGO_LETTERS, CENTRE, GAME_LABEL, bingoLetter, completeLine, toGo, type BingoView, type GameState } from '@office3d/shared';
import { T } from '../strings.th';
import { seatedTable, useStore } from '../store';
import { sendGameAct, sendGameSit, sendGameStand } from '../game/net';

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : 0;
}

const Check = () => (
  <svg className="bingo-check" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const Star = () => (
  <svg className="bingo-check" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" /></svg>
);

/** One 5x5 card. `marks` and `line` are optional: the winner's card is shown without taps. */
function Card({ card, marks, called, line, onTap }: { card: number[]; marks: boolean[]; called: Set<number>; line?: number[] | null; onTap?: (n: number) => void }) {
  return (
    <div className="bingo-card" role="grid" aria-label={T.bingoCard}>
      {BINGO_LETTERS.split('').map((l) => <div key={l} className="bingo-head" role="columnheader">{l}</div>)}
      {card.map((n, i) => {
        const free = i === CENTRE;
        const marked = !!marks[i];
        const ready = !free && !marked && called.has(n);
        const inLine = !!line?.includes(i);
        const label = free ? T.bingoFree : `${bingoLetter(n)} ${n} ${marked ? T.bingoMarked : ready ? T.bingoCalled : ''}`;
        return (
          <button key={i} role="gridcell" className={`bingo-cell ${marked ? 'marked' : ''} ${ready ? 'ready' : ''} ${inLine ? 'win' : ''}`}
            disabled={!onTap || free || (!ready && !marked)} onClick={() => onTap?.(n)} aria-label={label} aria-pressed={marked}>
            {free ? <Star /> : <span>{n}</span>}
            {marked && !free && <Check />}
          </button>
        );
      })}
    </div>
  );
}

/** Bingo table panel: the caller's number, your card to tap, and the claim button. */
export function BingoPanel({ g, view }: { g: GameState; view: BingoView }) {
  const selfId = useStore((s) => s.selfId);
  const people = useStore((s) => s.people);
  const games = useStore((s) => s.games);
  const set = useStore((s) => s.set);
  const me = view.seats.findIndex((s) => s && s.userId === selfId);
  const inRound = me >= 0 && view.seats[me]!.inRound && view.card.length === 25;
  const seated = seatedTable({ games, selfId });
  const nameOf = (id: string) => people[id]?.user.displayName ?? '—';
  const called = new Set(view.called);
  const last = view.called.at(-1) ?? null;
  const total = view.called.length === 0 ? BINGO.firstCallMs : BINGO.callMs;
  const remaining = useCountdown(view.phase === 'playing' ? g.deadline : null);
  const free = view.seats.some((s) => !s);
  const ready = inRound && view.phase === 'playing' && toGo(view.marks) === 0;
  const over = view.phase === 'over';
  const status = view.phase === 'waiting' ? T.gameWaiting : view.phase === 'playing' ? T.bingoNext(Math.ceil(remaining / 1000)) : '';

  return (
    <section className="gamepanel bingo" aria-label={GAME_LABEL.bingo}>
      <header className="row">
        <h2 className="grow">{GAME_LABEL.bingo}</h2>
        <span className="muted small">{status}</span>
        <button className="ghost" onClick={() => set({ openTable: null })} aria-label={T.gameClose}>✕</button>
      </header>
      <p className="sr-only" role="status">{last ? `${bingoLetter(last)} ${last}` : ''}</p>

      <div className="bingo-top">
        <div className="ball" aria-label={last ? `${bingoLetter(last)} ${last}` : T.bingoNone}>
          {last ? <><small>{bingoLetter(last)}</small><b>{last}</b></> : <small>{T.bingoNone}</small>}
        </div>
        <div className="grow">
          <div className="timer" aria-hidden="true"><div className="timer-fill" style={{ width: `${view.phase === 'playing' ? Math.min(100, (remaining / total) * 100) : 0}%` }} /></div>
          <div className="recent small" aria-label={T.bingoRecent}>
            {view.called.slice(-9, -1).reverse().map((n) => <span key={n} className="chipn">{bingoLetter(n)}{n}</span>)}
          </div>
        </div>
      </div>

      {inRound && view.phase === 'playing' && <Card card={view.card} marks={view.marks} called={called} onTap={(n) => sendGameAct({ type: 'mark', n })} />}
      {over && view.winnerCard.length === 25 && (
        <>
          <p className="result small center" role="status">
            {view.winner ? T.bingoWinner(nameOf(view.winner)) : T.bingoNoWinner} · {T.gameNextHand}
          </p>
          <Card card={view.winnerCard} marks={view.winnerCard.map((n, i) => i === CENTRE || called.has(n))} called={called} line={view.line} />
        </>
      )}
      {over && view.winnerCard.length !== 25 && <p className="result small center" role="status">{T.bingoNoWinner} · {T.gameNextHand}</p>}
      {me >= 0 && !inRound && view.phase === 'playing' && <p className="small muted center">{T.unoWaitNext}</p>}

      <div className="bingo-players small">
        {view.seats.map((s, i) => s && (
          <span key={i} className={`bplayer ${i === me ? 'mine' : ''}`}>
            {nameOf(s.userId)}{s.inRound && view.phase === 'playing' && <span className="muted"> · {s.toGo === 0 ? T.bingoReady : T.bingoToGo(s.toGo)}</span>}
          </span>
        ))}
      </div>

      <details className="bingo-board">
        <summary className="small">{T.bingoBoard} ({view.called.length}/75)</summary>
        {BINGO_LETTERS.split('').map((l, r) => (
          <div key={l} className="board-row" aria-label={l}>
            <b>{l}</b>
            {Array.from({ length: 15 }, (_, k) => r * 15 + k + 1).map((n) => <span key={n} className={called.has(n) ? 'on' : ''}>{n}</span>)}
          </div>
        ))}
      </details>

      <div className="gamefoot">
        <div className="row end">
          {inRound && view.phase === 'playing' && (
            <button className="primary big-claim" disabled={!ready} onClick={() => sendGameAct({ type: 'claim' })}>{T.bingoClaim}</button>
          )}
          <span className="muted small grow">{me >= 0 ? '' : T.gameWatching}</span>
          {me >= 0
            ? <button onClick={() => sendGameStand()}>{T.gameStand}</button>
            : <button className="primary" disabled={!free || !!seated} onClick={() => sendGameSit(g.tableId)}>{T.gameSit}</button>}
        </div>
      </div>
    </section>
  );
}
