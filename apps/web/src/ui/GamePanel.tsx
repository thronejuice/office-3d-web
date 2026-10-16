import { useEffect, useMemo, useState } from 'react';
import { GAME_LABEL, SIT_DISTANCE, footprint, type PokerView, type SeatView } from '@office3d/shared';
import { T } from '../strings.th';
import { seatedTable, useStore } from '../store';
import { live } from '../game/live';
import { sendGameAct, sendGameSit, sendGameStand } from '../game/net';
import { Chip, PlayingCard } from './Cards';
import { ChessPanel } from './ChessPanel';
import { UnoPanel } from './UnoPanel';
import { PokDengPanel } from './PokDengPanel';
import { BingoPanel } from './BingoPanel';
import { ErrorBoundary } from './ErrorBoundary';

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : 0;
}

function SeatBox({ s, i, view, name, mine, turn }: { s: SeatView | null; i: number; view: PokerView; name: string; mine: boolean; turn: boolean }) {
  if (!s) return <div className="seat empty" aria-label={`${T.gameEmpty} ${i + 1}`}><span className="muted small">{T.gameEmpty}</span></div>;
  const tags = [s.folded && T.gameFolded, s.allIn && T.gameAllInTag, s.leaving && T.gameLeaving].filter(Boolean).join(' · ');
  return (
    <div className={`seat ${turn ? 'turn' : ''} ${s.folded ? 'folded' : ''} ${mine ? 'mine' : ''}`} aria-current={turn ? 'true' : undefined}>
      <div className="seat-name"><strong>{name}</strong>{view.button === i && <span className="dealer" title="ดีลเลอร์">{T.gameDealer}</span>}</div>
      <div className="small"><Chip amount={s.chips} /></div>
      {s.bet > 0 && <div className="small muted">{T.gameBet} <Chip amount={s.bet} /></div>}
      {tags && <div className="small muted">{tags}</div>}
      {s.inHand && !mine && <div className="seat-cards">{s.hole.map((c, k) => <PlayingCard key={k} card={c} size="sm" />)}</div>}
    </div>
  );
}

function Actions({ view, me, deadline }: { view: PokerView; me: number; deadline: number | null }) {
  const s = view.seats[me]!;
  const toCall = Math.max(0, view.currentBet - s.bet);
  const maxTo = s.bet + s.chips;
  const minTo = Math.min(view.currentBet + view.minRaise, maxTo);
  const [to, setTo] = useState(minTo);
  useEffect(() => setTo((t) => Math.min(Math.max(t, minTo), maxTo)), [minTo, maxTo]);
  const canRaise = maxTo > view.currentBet && s.chips > toCall;
  const remaining = useCountdown(deadline);
  return (
    <div className="actions" role="group" aria-label={T.gameYourTurn}>
      <div className="timer" aria-hidden="true"><div className="timer-fill" style={{ width: `${Math.min(100, (remaining / 30000) * 100)}%` }} /></div>
      <div className="row">
        <button onClick={() => sendGameAct({ type: 'fold' })}>{T.gameFold}</button>
        {toCall === 0
          ? <button className="primary" onClick={() => sendGameAct({ type: 'check' })}>{T.gameCheck}</button>
          : <button className="primary" onClick={() => sendGameAct({ type: 'call' })}>{toCall >= s.chips ? T.gameAllIn : T.gameCall(toCall)}</button>}
        <button onClick={() => sendGameAct({ type: 'allin' })}>{T.gameAllIn}</button>
      </div>
      {canRaise && (
        <div className="row raise">
          <input type="range" aria-label={T.gameRaise} min={minTo} max={maxTo} step={10} value={to} onChange={(e) => setTo(Number(e.target.value))} />
          <button onClick={() => sendGameAct({ type: 'raise', amount: to })}>{T.gameRaiseTo(to)}</button>
        </div>
      )}
    </div>
  );
}

/** Table panel: opens when you sit down or tap a game table. Read-only for people who are not seated. */
function GamePanelInner() {
  const openTable = useStore((s) => s.openTable);
  const games = useStore((s) => s.games);
  const people = useStore((s) => s.people);
  const selfId = useStore((s) => s.selfId);
  const set = useStore((s) => s.set);
  const g = openTable ? games[openTable] : undefined;
  const seated = seatedTable({ games, selfId });
  const view = g?.view;
  const me = view && view.game === 'poker' ? view.seats.findIndex((x) => x && x.userId === selfId && !x.leaving) : -1;
  const myTurn = !!view && view.game === 'poker' && me >= 0 && view.toAct === me;
  const nameOf = (id: string) => people[id]?.user.displayName ?? '—';
  const free = view ? view.seats.some((x) => !x) : false;
  useEffect(() => {
    // Escape closes the table panel (the seat stays yours)
    if (!openTable) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) set({ openTable: null }); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openTable, set]);
  const announce = useMemo(() => (myTurn ? T.gameYourTurn : ''), [myTurn]);
  if (!g || !view) return null;
  if (view.game === 'chess') return <ChessPanel g={g} view={view} />;
  if (view.game === 'uno') return <UnoPanel g={g} view={view} />;
  if (view.game === 'pokdeng') return <PokDengPanel g={g} view={view} />;
  if (view.game === 'bingo') return <BingoPanel g={g} view={view} />;

  const turnName = view.toAct >= 0 && view.seats[view.toAct] ? nameOf(view.seats[view.toAct]!.userId) : '';
  const won = view.phase === 'showdown' && view.result ? view.result.won : [];

  return (
    <section className="gamepanel" aria-label={GAME_LABEL.poker}>
      <header className="row">
        <h2 className="grow">{GAME_LABEL.poker}</h2>
        <span className="muted small">{T.gamePhase[view.phase]}</span>
        <button className="ghost" onClick={() => set({ openTable: null })} aria-label={T.gameClose}>✕</button>
      </header>
      <p className="sr-only" role="status">{announce}</p>

      <div className="felt">
        <div className="board" aria-label={T.gameBoard}>
          {Array.from({ length: 5 }, (_, i) => view.board[i] !== undefined ? <PlayingCard key={i} card={view.board[i]} /> : <div key={i} className="slot" />)}
        </div>
        <div className="pot">{T.gamePot} <Chip amount={view.pot} /></div>
        {view.phase === 'waiting' && <p className="small muted">{T.gameWaiting}</p>}
        {view.phase !== 'waiting' && view.phase !== 'showdown' && turnName && <p className="small">{myTurn ? <strong>{T.gameYourTurn}</strong> : T.gameTurnOf(turnName)}</p>}
        {won.length > 0 && (
          <p className="small result" role="status">
            {won.map((w) => `${T.gameWins(nameOf(w.userId), w.amount)}${view.result!.shown[w.seat] ? ` (${view.result!.shown[w.seat].name})` : ''}`).join(' · ')}
            {' · '}{T.gameNextHand}
          </p>
        )}
      </div>

      <div className="seats">
        {view.seats.map((s, i) => <SeatBox key={i} s={s} i={i} view={view} name={s ? nameOf(s.userId) : ''} mine={i === me} turn={view.toAct === i} />)}
      </div>

      {me >= 0 && view.seats[me]!.inHand && (
        <div className="myhand">
          <span className="small muted">{T.gameYourHand}</span>
          <div className="seat-cards">{view.seats[me]!.hole.map((c, k) => <PlayingCard key={k} card={c} size="lg" />)}</div>
        </div>
      )}

      <div className="gamefoot">
        {myTurn && <Actions view={view} me={me} deadline={g.deadline} />}
  
        <div className="row end">
          <span className="muted small grow">{me >= 0 ? T.playChips : T.gameWatching}</span>
          {me >= 0
            ? <button onClick={() => sendGameStand()}>{T.gameStand}</button>
            : <button className="primary" disabled={!free || !!seated} onClick={() => sendGameSit(g.tableId)}>{T.gameSit}</button>}
        </div>
      </div>
    </section>
  );
}

/** HUD button shown while standing next to a game table (the table can also be tapped in the scene). */
export function NearTableButton() {
  const near = useStore((s) => s.nearTable);
  const openTable = useStore((s) => s.openTable);
  const map = useStore((s) => s.map);
  useEffect(() => {
    const tick = () => {
      const m = useStore.getState().map;
      let best: string | null = null, bestD = SIT_DISTANCE;
      for (const f of m?.furniture ?? []) {
        if (!f.game) continue;
        for (const c of footprint(f)) {
          const d = Math.hypot(live.self.x - (c.x + 0.5), live.self.y - (c.y + 0.5));
          if (d <= bestD) { bestD = d; best = f.id; }
        }
      }
      if (best !== useStore.getState().nearTable) useStore.setState({ nearTable: best });
    };
    tick();
    const t = setInterval(tick, 300);
    return () => clearInterval(t);
  }, []);
  const f = map?.furniture.find((x) => x.id === near);
  if (!f?.game || openTable === f.id) return null;
  return (
    <button className="near-table pill" onClick={() => useStore.setState({ openTable: f.id })}>
      {T.gameNear(T.gameNames[f.game] ?? f.game)}
    </button>
  );
}

/** The table panel, isolated: if a game screen fails to render, only the panel is replaced by a notice. */
export function GamePanel() {
  const openTable = useStore((s) => s.openTable);
  const set = useStore((s) => s.set);
  return (
    <ErrorBoundary label="game panel" resetKey={openTable} fallback={() => (
      <section className="gamepanel" role="alert">
        <p>{T.gamePanelFailed}</p>
        <div className="row end"><button onClick={() => set({ openTable: null })}>{T.gameClose}</button></div>
      </section>
    )}>
      <GamePanelInner />
    </ErrorBoundary>
  );
}
