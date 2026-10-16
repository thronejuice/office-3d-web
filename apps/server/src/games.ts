import {
  BINGO, CHESS, POKDENG, POKER, SIT_DISTANCE, UNO, footprint, gameTables, tableSeats,
  BingoTable, ChessTable, PokDengTable, PokerTable, UnoTable, type GameAction, type GameId, type GameState, type MapData, type Seat,
} from '@office3d/shared';

/** The server's view of a player's position lags the client by a moment, so it is a little more forgiving than the sit button. */
const SIT_SLACK = 0.75;

/** What the game layer needs from the realtime layer. */
export interface GameHost {
  /** Send a personalised table state to one user. */
  send(userId: string, g: GameState): void;
  error(userId: string, code: string): void;
  online(): string[];
  pos(userId: string): { x: number; y: number } | null;
  /** Put the avatar on a seat tile (authoritative: also corrects the client). */
  place(userId: string, seat: Seat): void;
}

interface Table {
  id: string;
  game: GameId;
  engine: PokerTable | ChessTable | UnoTable | PokDengTable | BingoTable;
  seats: Seat[];
  deadline: number | null;
  turnTimer: NodeJS.Timeout | null;
  handTimer: NodeJS.Timeout | null;
  turnKey: string; // poker: hand + street + seat to act; the turn clock only restarts when this changes
}

/**
 * Server-authoritative game tables, kept in memory only (a restart empties every table).
 * Poker chips are play money handed out when a player sits and forgotten when they stand.
 */
export class Games {
  private tables = new Map<string, Table>();
  private map: MapData | null = null;

  constructor(private host: GameHost, private rng: () => number = Math.random) {}

  private build(id: string, game: GameId, seats: Seat[]): Table {
    const engine = game === 'chess' ? new ChessTable() : game === 'uno' ? new UnoTable(this.rng) : game === 'pokdeng' ? new PokDengTable(this.rng) : game === 'bingo' ? new BingoTable(this.rng) : new PokerTable(this.rng, { ...POKER, maxSeats: Math.min(POKER.maxSeats, seats.length) });
    return { id, game, engine, seats, deadline: null, turnTimer: null, handTimer: null, turnKey: '' };
  }

  /** (Re)build tables from a map. Tables that vanished are closed and everybody sitting there is stood up. */
  sync(map: MapData) {
    this.map = map;
    const wanted = new Map(gameTables(map).map((f) => [f.id, f]));
    for (const [id, t] of this.tables) {
      const f = wanted.get(id);
      const seats = f ? tableSeats(map, f) : [];
      if (!f || f.game !== t.game || (seats.length !== t.seats.length && t.engine.occupied > 0) || seats.length < 2) this.close(id);
      else t.seats = seats;
    }
    for (const f of wanted.values()) {
      if (this.tables.has(f.id) || !f.game) continue;
      const seats = tableSeats(map, f);
      if (seats.length < 2) continue;
      this.tables.set(f.id, this.build(f.id, f.game, seats));
    }
    this.broadcastAll();
  }

  private close(id: string) {
    const t = this.tables.get(id);
    if (!t) return;
    this.clearTimers(t);
    this.tables.delete(id);
    for (const u of this.host.online()) this.host.send(u, { tableId: id, view: null, deadline: null });
  }

  private clearTimers(t: Table) {
    if (t.turnTimer) clearTimeout(t.turnTimer);
    if (t.handTimer) clearTimeout(t.handTimer);
    t.turnTimer = t.handTimer = null;
  }

  tableOf(userId: string): Table | undefined {
    for (const t of this.tables.values()) if (t.engine.seatOf(userId) >= 0) return t;
    return undefined;
  }
  isSeated(userId: string) { return !!this.tableOf(userId); }
  seatPos(userId: string): Seat | null {
    const t = this.tableOf(userId);
    return t ? t.seats[t.engine.seatOf(userId)] ?? null : null;
  }

  private nearTable(userId: string, tableId: string): boolean {
    const p = this.host.pos(userId);
    const f = this.map?.furniture.find((x) => x.id === tableId);
    if (!p || !f) return false;
    return footprint(f).some((c) => Math.hypot(p.x - (c.x + 0.5), p.y - (c.y + 0.5)) <= SIT_DISTANCE + SIT_SLACK);
  }

  sit(userId: string, tableId: string) {
    const t = this.tables.get(tableId);
    if (!t) return this.host.error(userId, 'no_table');
    if (this.isSeated(userId)) return this.host.error(userId, 'already_seated');
    if (!this.nearTable(userId, tableId)) return this.host.error(userId, 'too_far');
    const i = t.engine.sit(userId);
    if (i < 0 || !t.seats[i]) {
      if (i >= 0) t.engine.stand(userId);
      return this.host.error(userId, 'table_full');
    }
    this.host.place(userId, t.seats[i]);
    this.afterChange(t);
  }

  stand(userId: string) {
    const t = this.tableOf(userId);
    if (!t) return;
    t.engine.stand(userId);
    this.afterChange(t);
  }

  /** Disconnected / left the office: same as standing up. */
  leave(userId: string) { this.stand(userId); }

  act(userId: string, a: GameAction) {
    const t = this.tableOf(userId);
    if (!t) return this.host.error(userId, 'not_seated');
    if (!a || typeof a !== 'object' || typeof (a as { type?: unknown }).type !== 'string') return this.host.error(userId, 'bad_action');
    const raw = a as { type: string; amount?: unknown };
    const err = t.engine instanceof ChessTable
      ? t.engine.act(userId, a as Parameters<ChessTable['act']>[1])
      : t.engine instanceof UnoTable
        ? t.engine.act(userId, a as Parameters<UnoTable['act']>[1])
        : t.engine instanceof PokDengTable
          ? t.engine.act(userId, a as Parameters<PokDengTable['act']>[1])
          : t.engine instanceof BingoTable
            ? t.engine.act(userId, a as Parameters<BingoTable['act']>[1])
            : t.engine.act(userId, { type: raw.type as 'fold', amount: typeof raw.amount === 'number' ? raw.amount : undefined });
    if (err) return this.host.error(userId, err);
    this.afterChange(t);
  }

  /** Drive the table forward after any change: start games, arm timers, tell everyone. */
  private afterChange(t: Table): void {
    if (t.engine instanceof ChessTable) this.afterChess(t, t.engine);
    else if (t.engine instanceof UnoTable) this.afterUno(t, t.engine);
    else if (t.engine instanceof PokDengTable) this.afterPokDeng(t, t.engine);
    else if (t.engine instanceof BingoTable) this.afterBingo(t, t.engine);
    else this.afterPoker(t, t.engine);
  }

  private afterChess(t: Table, c: ChessTable) {
    this.clearTimers(t);
    t.deadline = null;
    if (c.phase === 'waiting') {
      if (c.tryStart()) return this.afterChange(t);
    } else if (c.phase === 'over') {
      t.handTimer = setTimeout(() => { t.handTimer = null; c.tryStart(); this.afterChange(t); }, CHESS.nextGameMs);
    }
    this.broadcast(t);
  }

  private afterUno(t: Table, u: UnoTable) {
    const key = u.phase === 'playing' ? `${u.handNo}:${u.turn}:${u.drew}` : '';
    if (u.phase === 'playing' && key === t.turnKey && t.turnTimer) return this.broadcast(t); // e.g. a spectator sat down: keep the clock
    this.clearTimers(t);
    t.turnKey = key;
    t.deadline = null;
    if (u.phase === 'waiting') {
      if (u.tryStart()) return this.afterChange(t);
    } else if (u.phase === 'over') {
      t.handTimer = setTimeout(() => { t.handTimer = null; u.tryStart(); this.afterChange(t); }, UNO.nextRoundMs);
    } else {
      t.deadline = Date.now() + UNO.turnMs;
      t.turnTimer = setTimeout(() => {
        t.turnTimer = null;
        const r = u.timeout();
        if (r?.stood) this.host.error(r.userId, 'timeout_stand');
        this.afterChange(t);
      }, UNO.turnMs);
    }
    this.broadcast(t);
  }

  /** Bingo has no turns: a caller clock draws the next number; marks and claims never restart it. */
  private afterBingo(t: Table, b: BingoTable) {
    const key = b.phase === 'playing' ? `${b.handNo}:${b.called.length}` : '';
    if (key && key === t.turnKey && t.turnTimer) return this.broadcast(t);
    this.clearTimers(t);
    t.turnKey = key;
    t.deadline = null;
    if (b.phase === 'waiting') {
      if (b.tryStart()) return this.afterChange(t);
    } else if (b.phase === 'over') {
      t.handTimer = setTimeout(() => { t.handTimer = null; b.tryStart(); this.afterChange(t); }, BINGO.nextRoundMs);
    } else {
      const ms = b.called.length === 0 ? BINGO.firstCallMs : BINGO.callMs;
      t.deadline = Date.now() + ms; // when the next number will be called
      t.turnTimer = setTimeout(() => { t.turnTimer = null; b.callNext(); this.afterChange(t); }, ms);
    }
    this.broadcast(t);
  }

  private afterPokDeng(t: Table, d: PokDengTable) {
    const key = d.phase === 'betting' ? `${d.handNo}:bet` : d.phase === 'acting' ? `${d.handNo}:act:${d.toAct}` : '';
    if (key && key === t.turnKey && t.turnTimer) return this.broadcast(t); // someone else bet, or a spectator sat down: keep the clock
    this.clearTimers(t);
    t.turnKey = key;
    t.deadline = null;
    if (d.phase === 'waiting') {
      const r = d.tryStart();
      r.busted.forEach((u) => this.host.error(u, 'busted'));
      if (r.started) return this.afterChange(t);
    } else if (d.phase === 'showdown') {
      t.handTimer = setTimeout(() => {
        t.handTimer = null;
        const r = d.tryStart();
        r.busted.forEach((u) => this.host.error(u, 'busted'));
        this.afterChange(t);
      }, POKDENG.nextRoundMs);
    } else {
      const ms = d.phase === 'betting' ? POKDENG.betMs : POKDENG.actMs;
      t.deadline = Date.now() + ms;
      t.turnTimer = setTimeout(() => {
        t.turnTimer = null;
        const r = d.timeout();
        r.stood.forEach((u) => this.host.error(u, 'timeout_stand'));
        this.afterChange(t);
      }, ms);
    }
    this.broadcast(t);
  }

  private afterPoker(t: Table, p: PokerTable) {
    const inPlay = p.phase !== 'waiting' && p.phase !== 'showdown';
    const key = inPlay ? `${p.handNo}:${p.phase}:${p.toAct}` : '';
    if (inPlay && key === t.turnKey && t.turnTimer) return this.broadcast(t); // e.g. a spectator sat down: keep the clock
    this.clearTimers(t);
    t.turnKey = key;
    if (p.phase === 'waiting' || p.phase === 'showdown') {
      if (p.phase === 'waiting') {
        const r = p.tryStart();
        r.busted.forEach((u) => this.host.error(u, 'busted'));
        if (r.started) return this.afterChange(t);
      } else {
        t.handTimer = setTimeout(() => {
          t.handTimer = null;
          const r = p.tryStart();
          r.busted.forEach((u) => this.host.error(u, 'busted'));
          this.afterChange(t);
        }, POKER.nextHandMs);
      }
      t.deadline = null;
    } else {
      t.deadline = Date.now() + POKER.turnMs;
      t.turnTimer = setTimeout(() => {
        t.turnTimer = null;
        const r = p.timeout();
        if (r?.stood) this.host.error(r.userId, 'timeout_stand');
        this.afterChange(t);
      }, POKER.turnMs);
    }
    this.broadcast(t);
  }

  private broadcast(t: Table) {
    for (const u of this.host.online()) this.host.send(u, { tableId: t.id, view: t.engine.view(u), deadline: t.deadline });
  }
  private broadcastAll() { for (const t of this.tables.values()) this.broadcast(t); }

  /** Everything a freshly connected user needs. */
  snapshotFor(userId: string): GameState[] {
    return [...this.tables.values()].map((t) => ({ tableId: t.id, view: t.engine.view(userId), deadline: t.deadline }));
  }

  close_all() { for (const t of this.tables.values()) this.clearTimers(t); }
}
