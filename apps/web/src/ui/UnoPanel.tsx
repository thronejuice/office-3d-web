import { useEffect, useState } from 'react';
import { GAME_LABEL, UNO, UNO_COLORS, cardColor, isWild, type GameState, type UnoColor, type UnoView } from '@office3d/shared';
import { T } from '../strings.th';
import { seatedTable, useStore } from '../store';
import { sendGameAct, sendGameSit, sendGameStand } from '../game/net';
import { COLOR_NAME, ColorShape, UNO_FILL, UnoCardView, unoName } from './UnoCards';

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : 0;
}

/** Uno table panel: other players' card counts, the piles, your hand, and the buttons you need. */
export function UnoPanel({ g, view }: { g: GameState; view: UnoView }) {
  const selfId = useStore((s) => s.selfId);
  const people = useStore((s) => s.people);
  const games = useStore((s) => s.games);
  const set = useStore((s) => s.set);
  const [wild, setWild] = useState<string | null>(null);
  const me = view.seats.findIndex((s) => s && s.userId === selfId);
  const myTurn = view.phase === 'playing' && me >= 0 && view.turn === me;
  const seated = seatedTable({ games, selfId });
  const remaining = useCountdown(myTurn ? g.deadline : null);
  const nameOf = (id: string) => people[id]?.user.displayName ?? '—';
  const free = view.seats.some((s) => !s);
  useEffect(() => { setWild(null); }, [view.turn, view.handNo, view.phase]);

  const play = (card: string) => {
    if (isWild(card)) return setWild(card);
    sendGameAct({ type: 'play', card });
  };
  const last = view.last;
  const lastText = last && view.seats[last.seat]
    ? `${nameOf(view.seats[last.seat]!.userId)} ${last.kind === 'play' ? `${T.unoPlayed} ${unoName(last.card!)}` : last.kind === 'draw' ? T.unoDrew : T.unoPassed}`
    : '';
  const turnName = view.turn >= 0 && view.seats[view.turn] ? nameOf(view.seats[view.turn]!.userId) : '';
  const status = view.phase === 'waiting' ? T.gameWaiting : view.phase === 'over' ? '' : myTurn ? T.gameYourTurn : T.gameTurnOf(turnName);

  return (
    <section className="gamepanel uno" aria-label={GAME_LABEL.uno}>
      <header className="row">
        <h2 className="grow">{GAME_LABEL.uno}</h2>
        <span className="muted small">{status}</span>
        <button className="ghost" onClick={() => set({ openTable: null })} aria-label={T.gameClose}>✕</button>
      </header>
      <p className="sr-only" role="status">{myTurn ? T.gameYourTurn : lastText}</p>

      <div className="seats">
        {view.seats.map((s, i) => !s ? <div key={i} className="seat empty"><span className="muted small">{T.gameEmpty}</span></div> : (
          <div key={i} className={`seat ${view.turn === i ? 'turn' : ''} ${i === me ? 'mine' : ''}`} aria-current={view.turn === i ? 'true' : undefined}>
            <div className="seat-name"><strong>{nameOf(s.userId)}</strong></div>
            {s.inRound
              ? <div className="small">{T.unoCards(s.count)}{s.count === 1 && <span className="uno-tag">UNO!</span>}</div>
              : <div className="small muted">{T.unoWaitNext}</div>}
          </div>
        ))}
      </div>

      <div className="uno-table">
        <button className="pile" disabled={!myTurn || view.drew} onClick={() => sendGameAct({ type: 'draw' })} aria-label={`${T.unoDraw} (${view.drawCount})`}>
          <UnoCardView card={null} />
          <span className="small">{T.unoDraw}</span>
        </button>
        <div className="pile static">
          {view.top ? <UnoCardView card={view.top} size="lg" /> : <div className="slot" />}
          <span className="small color-now"><ColorShape color={view.color} size={16} stroke="#00000033" /> {COLOR_NAME[view.color]} {view.dir === 1 ? '↻' : '↺'}</span>
        </div>
      </div>
      {lastText && view.phase === 'playing' && <p className="small muted center">{lastText}</p>}
      {view.phase === 'over' && (
        <p className="result small center" role="status">
          {view.winner ? T.gameWins(nameOf(view.winner), 0).replace(/ 0$/, '') : ''}{view.reason === 'left' ? ` (${T.unoOthersLeft})` : ''} · {T.gameNextHand}
        </p>
      )}

      {me >= 0 && view.phase === 'playing' && (
        <div className="uno-hand" role="group" aria-label={T.gameYourHand}>
          {view.hand.map((c, i) => {
            const ok = myTurn && view.playable.includes(c);
            return (
              <button key={`${c}${i}`} className={`hand-card ${ok ? 'ok' : ''}`} disabled={!ok} onClick={() => play(c)} aria-label={unoName(c)}>
                <UnoCardView card={c} />
              </button>
            );
          })}
        </div>
      )}
      {wild && (
        <div className="row promo" role="group" aria-label={T.unoChooseColor}>
          {UNO_COLORS.map((c: UnoColor) => (
            <button key={c} onClick={() => { sendGameAct({ type: 'play', card: wild, color: c }); setWild(null); }} style={{ borderColor: UNO_FILL[c] }}>
              <ColorShape color={c} size={16} /> {COLOR_NAME[c]}
            </button>
          ))}
        </div>
      )}

      <div className="gamefoot">
        {myTurn && (
          <div className="actions">
            <div className="timer" aria-hidden="true"><div className="timer-fill" style={{ width: `${Math.min(100, (remaining / UNO.turnMs) * 100)}%` }} /></div>
            {view.drew && <div className="row"><button className="primary" onClick={() => sendGameAct({ type: 'pass' })}>{T.unoPass}</button><span className="small muted">{T.unoDrewHint}</span></div>}
          </div>
        )}
        <div className="row end">
          <span className="muted small grow">{me >= 0 ? '' : T.gameWatching}</span>
          {me >= 0
            ? <button onClick={() => sendGameStand()}>{T.gameStand}</button>
            : <button className="primary" disabled={!free || !!seated} onClick={() => sendGameSit(g.tableId)}>{T.gameSit}</button>}
        </div>
      </div>
    </section>
  );
}
