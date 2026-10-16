import type { Server as HttpServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import { and, eq } from 'drizzle-orm';
import {
  DEFAULT_AVATAR, EMOTES, KNOCK_COOLDOWN_MS, MOVE, STATUSES, isWalkablePos, nearestWalkable, walkGrid, zoneGrid,
  type ClientToServer, type IceServer, type MapData, type Presence, type ServerToClient, type Status,
} from '@office3d/shared';
import type { Config } from './config';
import type { Db } from './db';
import { schema } from './db';
import { userForToken, type UserRow } from './auth';
import { latestMap } from './app';
import type { Hub } from './hub';
import { Games } from './games';

const { users, missedKnocks } = schema;
type Sock = Socket<ClientToServer, ServerToClient>;
interface Peer { p: Presence; sock: Sock; lastMoveAt: number; lastKnock: Map<string, number> }

const toPublic = (u: UserRow) => ({ id: u.id, username: u.username, displayName: u.displayName, department: u.department, jobTitle: u.jobTitle, role: u.role });
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function attachRealtime(httpServer: HttpServer, db: Db, config: Config): Promise<Hub & { close(): void }> {
  const io = new Server<ClientToServer, ServerToClient>(httpServer, { path: '/socket.io', serveClient: false });
  const peers = new Map<string, Peer>();

  let map: MapData, version: number, grid: Uint8Array, zones: (string | null)[];
  const games = new Games({
    send: (id, g) => void peers.get(id)?.sock.emit('game', g),
    error: (id, code) => void peers.get(id)?.sock.emit('gameError', code),
    online: () => [...peers.keys()],
    pos: (id) => peers.get(id)?.p ?? null,
    place: (id, seat) => {
      const peer = peers.get(id);
      if (!peer) return;
      const { p } = peer;
      p.x = seat.x; p.y = seat.y; p.dir = seat.dir; p.zone = zoneAt(seat.x, seat.y);
      peer.lastMoveAt = Date.now();
      io.emit('moved', { id, x: p.x, y: p.y, dir: p.dir, zone: p.zone });
      peer.sock.emit('teleport', { x: p.x, y: p.y, dir: p.dir });
    },
  });
  const setMap = (m: MapData, v: number) => { map = m; version = v; grid = walkGrid(m); zones = zoneGrid(m); games.sync(m); };
  const first = await latestMap(db);
  setMap(first.data, first.version);

  const zoneAt = (x: number, y: number) => zones[Math.floor(y) * map.width + Math.floor(x)] ?? null;

  const iceFor = (userId: string): IceServer[] => {
    if (!config.turnHost || !config.turnSecret) return [];
    const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:${userId}`;
    const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
    return [{ urls: [`turn:${config.turnHost}:${config.turnPort}?transport=udp`, `turn:${config.turnHost}:${config.turnPort}?transport=tcp`], username, credential }];
  };

  const spawnFor = (userId: string) => {
    const d = map.desks.find((x) => x.userId === userId);
    const s = d ?? map.spawn;
    const base = { x: s.x + 0.5, y: s.y + 0.5 };
    // don't stack avatars: pick the closest free walkable tile if somebody already stands here
    const taken = (x: number, y: number) => [...peers.values()].some((o) => o.p.user.id !== userId && Math.hypot(o.p.x - x, o.p.y - y) < 0.9);
    if (!taken(base.x, base.y)) return base;
    let best = base, bestD = Infinity;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = s.x + dx + 0.5, y = s.y + dy + 0.5;
        const d = dx * dx + dy * dy;
        if (d < bestD && isWalkablePos(grid, map, x, y) && !taken(x, y)) { best = { x, y }; bestD = d; }
      }
    return best;
  };

  const remove = (id: string, sock?: Sock) => {
    const peer = peers.get(id);
    if (!peer || (sock && peer.sock !== sock)) return;
    games.leave(id);
    peers.delete(id);
    io.emit('left', id);
  };

  const cookieOf = (header: string | undefined) => header?.match(/(?:^|;\s*)sid=([^;]+)/)?.[1];

  io.use(async (sock, next) => {
    const user = await userForToken(db, cookieOf(sock.handshake.headers.cookie));
    if (!user || user.mustChangePassword) return next(new Error('unauthorized'));
    sock.data.user = user;
    next();
  });

  io.on('connection', async (sock: Sock) => {
    const user: UserRow = sock.data.user;
    const old = peers.get(user.id);
    if (old) { old.sock.emit('kicked', 'other_session'); old.sock.disconnect(true); games.leave(user.id); peers.delete(user.id); io.emit('left', user.id); }

    const pos = spawnFor(user.id);
    const p: Presence = {
      user: toPublic(user), avatar: user.avatar ?? DEFAULT_AVATAR, x: pos.x, y: pos.y, dir: 0,
      status: 'available', zone: zoneAt(pos.x, pos.y), muted: false, raised: false,
    };
    const peer: Peer = { p, sock, lastMoveAt: Date.now(), lastKnock: new Map() };
    const missedRows = await db
      .select({ id: missedKnocks.id, fromId: missedKnocks.fromId, fromName: users.displayName, at: missedKnocks.at })
      .from(missedKnocks).innerJoin(users, eq(users.id, missedKnocks.fromId)).where(eq(missedKnocks.toId, user.id));
    if (!sock.connected) return; // dropped while we were loading
    peers.set(user.id, peer);
    sock.emit('welcome', {
      selfId: user.id, map, mapVersion: version, people: [...peers.values()].map((x) => x.p), ice: iceFor(user.id),
      missed: missedRows.map((r) => ({ ...r, at: r.at.getTime() })),
    });
    sock.broadcast.emit('joined', p);
    for (const g of games.snapshotFor(user.id)) sock.emit('game', g);

    sock.on('move', (m) => {
      if (!m || !num(m.x) || !num(m.y) || !num(m.dir)) return;
      const seat = games.seatPos(user.id);
      if (seat) return void sock.emit('teleport', { x: seat.x, y: seat.y, dir: seat.dir }); // seated players cannot walk
      const now = Date.now();
      const dt = Math.max(now - peer.lastMoveAt, 50) / 1000;
      const dist = Math.hypot(m.x - p.x, m.y - p.y);
      const ok = isWalkablePos(grid, map, m.x, m.y) && dist <= MOVE.maxServerSpeed * dt + MOVE.speedSlack;
      if (!ok) return void sock.emit('teleport', { x: p.x, y: p.y });
      peer.lastMoveAt = now;
      if (dist > 0.01 && p.raised) { p.raised = false; io.emit('raised', { id: user.id, raised: false }); }
      p.x = m.x; p.y = m.y; p.dir = m.dir; p.zone = zoneAt(m.x, m.y);
      io.emit('moved', { id: user.id, x: p.x, y: p.y, dir: p.dir, zone: p.zone });
    });

    sock.on('setStatus', (s: Status) => {
      if (!STATUSES.includes(s)) return;
      p.status = s;
      io.emit('status', { id: user.id, status: s });
    });
    sock.on('setMuted', (m) => { p.muted = !!m; io.emit('muted', { id: user.id, muted: p.muted }); });
    sock.on('emote', (e) => { if (EMOTES.includes(e) && e !== 'raisehand') io.emit('emote', { id: user.id, emote: e, at: Date.now() }); });
    sock.on('raise', (on) => { p.raised = !!on; io.emit('raised', { id: user.id, raised: p.raised }); });

    sock.on('knock', async (toId) => {
      const target = peers.get(toId);
      if (typeof toId !== 'string' || !target || toId === user.id) return;
      const now = Date.now();
      if (now - (peer.lastKnock.get(toId) ?? 0) < KNOCK_COOLDOWN_MS) return;
      peer.lastKnock.set(toId, now);
      const silent = target.p.status === 'dnd';
      target.sock.emit('knock', { fromId: user.id, fromName: user.displayName, silent });
      if (silent) {
        const [row] = await db.insert(missedKnocks).values({ toId, fromId: user.id }).returning();
        target.sock.emit('missed', { id: row.id, fromId: user.id, fromName: user.displayName, at: row.at.getTime() });
      }
    });
    sock.on('gameSit', (id) => { if (typeof id === 'string') games.sit(user.id, id); });
    sock.on('gameStand', () => games.stand(user.id));
    sock.on('gameAct', (a) => games.act(user.id, a));
    sock.on('clearMissed', async () => { await db.delete(missedKnocks).where(eq(missedKnocks.toId, user.id)); });

    sock.on('signal', (m) => {
      const target = m && typeof m.to === 'string' ? peers.get(m.to) : undefined;
      if (target && target !== peer) target.sock.emit('signal', { from: user.id, data: m.data });
    });

    sock.on('disconnect', () => remove(user.id, sock));
  });

  return {
    kick(userId, reason) {
      const peer = peers.get(userId);
      if (!peer) return;
      peer.sock.emit('kicked', reason);
      peer.sock.disconnect(true);
      remove(userId);
    },
    async profileChanged(userId) {
      const peer = peers.get(userId);
      if (!peer) return;
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u) return;
      peer.p.user = toPublic(u);
      io.emit('profile', peer.p.user);
      if (u.avatar) { peer.p.avatar = u.avatar; io.emit('avatar', { id: userId, avatar: u.avatar }); }
    },
    mapPublished(m, v) {
      setMap(m, v);
      io.emit('map', { map: m, version: v });
      for (const [id, peer] of peers) {
        const { p } = peer;
        if (!isWalkablePos(grid, map, p.x, p.y)) {
          const n = nearestWalkable(grid, map, p.x, p.y) ?? spawnFor(id);
          p.x = n.x; p.y = n.y;
          peer.sock.emit('teleport', n);
        }
        p.zone = zoneAt(p.x, p.y);
        io.emit('moved', { id, x: p.x, y: p.y, dir: p.dir, zone: p.zone });
      }
    },
    close() { games.close_all(); io.close(); },
  };
}
