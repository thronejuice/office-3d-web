import { useEffect, useState } from 'react';
import { GAME_LABEL, POKDENG, type GameState, type PdView } from '@office3d/shared';
import { T } from '../strings.th';
import { seatedTable, useStore } from '../store';
import { sendGameAct, sendGameSit, sendGameStand } from '../game/net';
import { Chip, PlayingCard } from './Cards';

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : 0;
}

/** Pok Deng table panel: bet, optionally draw a third card, then everybody is compared with the dealer. */
export function PokDengPanel({ g, view }: { g: GameState; view: PdView }) {
  const selfId = useStore((s) => s.selfId);
  const people = useStore((s) => s.people);
  const games = useStore((s) => s.games);
  const set = useStore((s) => s.set);
  const me = view.seats.findIndex((s) => s && s.userId === selfId);
  const mine = me >= 0 ? view.seats[me]! : null;
  const seated = seatedTable({ games, selfId });
  const nameOf = (id: string) => people[id]?.user.displayName ?? '—';
  const isDealer = me >= 0 && me === view.dealer;
  const canBet = view.phase === 'betting' && !!mine && mine.inRound && !isDealer && !mine.bet;
  const myTurn = view.phase === 'acting' && me >= 0 && view.toAct === me;
  const clockOn = canBet || myTurn;
  const remaining = useCountdown(clockOn ? g.deadline : null);
  const total = view.phase === 'betting' ? POKDENG.betMs : POKDENG.actMs;
  const free = view.seats.some((s) => !s);
  const dealerName = view.dealer >= 0 && view.seats[view.dealer] ? nameOf(view.seats[view.dealer]!.userId) : '';
  const status = view.phase === 'waiting' ? T.gameWaiting
    : view.phase === 'betting' ? T.pdBetting
    : view.phase === 'acting' ? (myTurn ? T.gameYourTurn : T.gameTurnOf(view.seats[view.toAct] ? nameOf(view.seats[view.toAct]!.userId) : ''))
    : '';
  const res = view.result;
  const maxBet = mine ? Math.max(...POKDENG.bets.filter((b) => b <= mine.chips), mine.chips < POKDENG.bets[0] ? mine.chips : 0) : 0;

  return (
    <section className="gamepanel pokdeng" aria-label={GAME_LABEL.pokdeng}>
      <header className="row">
        <h2 className="grow">{GAME_LABEL.pokdeng}</h2>
        <span className="muted small">{status}</span>
        <button className="ghost" onClick={() => set({ openTable: null })} aria-label={T.gameClose}>✕</button>
      </header>
      <p className="sr-only" role="status">{canBet || myTurn ? T.gameYourTurn : ''}</p>
      {dealerName && <p className="small muted">{T.pdDealer}: <strong>{dealerName}</strong></p>}

      <div className="seats">
        {view.seats.map((s, i) => !s ? <div key={i} className="seat empty"><span className="muted small">{T.gameEmpty}</span></div> : (
          <div key={i} className={`seat ${view.toAct === i ? 'turn' : ''} ${i === me ? 'mine' : ''}`} aria-current={view.toAct === i ? 'true' : undefined}>
            <div className="seat-name"><strong>{nameOf(s.userId)}</strong>{s.isDealer && <span className="dealer" title={T.pdDealer}>{T.pdDealerShort}</span>}</div>
            <div className="small"><Chip amount={s.chips} /></div>
            {s.inRound && !s.isDealer && s.bet > 0 && <div className="small muted">{T.gameBet} <Chip amount={s.bet} /></div>}
            {s.inRound && !s.isDealer && !s.bet && view.phase === 'betting' && <div className="small muted">{T.pdChoosing}</div>}
            {!s.inRound && view.phase !== 'waiting' && <div className="small muted">{T.unoWaitNext}</div>}
            {s.count > 0 && <div className="seat-cards">{s.cards.map((c, k) => <PlayingCard key={k} card={c} size="sm" />)}</div>}
            {s.hand && <div className="small"><strong>{s.hand}</strong></div>}
            {res && view.phase === 'showdown' && (() => {
              const line = res.lines.find((l) => l.seat === i);
              const delta = line ? line.delta : i === res.dealer.seat ? res.dealer.delta : 0;
              const tag = line ? T.pdOutcome[line.outcome] : '';
              return <div className={`small ${delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'muted'}`}>{tag} {delta > 0 ? '+' : ''}{delta}</div>;
            })()}
          </div>
        ))}
      </div>

      {view.phase === 'showdown' && <p className="small muted center">{T.gameNextHand}</p>}

      <div className="gamefoot">
        {clockOn && (
          <div className="actions">
            <div className="timer" aria-hidden="true"><div className="timer-fill" style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }} /></div>
            {canBet && (
              <div className="row" role="group" aria-label={T.pdPlaceBet}>
                {POKDENG.bets.map((b) => <button key={b} className={b === POKDENG.bets[0] ? 'primary' : ''} disabled={b > (mine?.chips ?? 0)} onClick={() => sendGameAct({ type: 'bet', amount: b })}>{b}</button>)}
                {mine && mine.chips < POKDENG.bets[0] && <button className="primary" onClick={() => sendGameAct({ type: 'bet', amount: mine.chips })}>{T.gameAllIn} {mine.chips}</button>}
              </div>
            )}
            {myTurn && (
              <div className="row">
                <button className="primary" disabled={(mine?.count ?? 0) !== 2} onClick={() => sendGameAct({ type: 'draw' })}>{T.pdDraw}</button>
                <button onClick={() => sendGameAct({ type: 'stay' })}>{T.pdStay}</button>
              </div>
            )}
          </div>
        )}
        <div className="row end">
          <span className="muted small grow">{me >= 0 ? T.playChips : T.gameWatching}{maxBet ? '' : ''}</span>
          {me >= 0
            ? <button onClick={() => sendGameStand()}>{T.gameStand}</button>
            : <button className="primary" disabled={!free || !!seated} onClick={() => sendGameSit(g.tableId)}>{T.gameSit}</button>}
        </div>
      </div>
    </section>
  );
}
