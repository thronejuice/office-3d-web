import { io, type Socket } from 'socket.io-client';
import type { AvatarConfig, ClientToServer, Emote, GameAction, ServerToClient, Status } from '@office3d/shared';
import { EMOTE_DURATION_MS } from '@office3d/shared';
import { live } from './live';
import { voice } from './voice';
import { music } from './music';
import { dismissToast, patchPerson, seatedTable, toast, useStore } from '../store';
import { T } from '../strings.th';

type Sock = Socket<ServerToClient, ClientToServer>;
let socket: Sock | null = null;
export const net = () => socket;

const set = useStore.setState;

export function connectOffice() {
  socket?.disconnect();
  const s: Sock = (socket = io({ path: '/socket.io', transports: ['websocket'] }));

  s.on('connect', () => set({ connected: true }));
  s.on('disconnect', () => set({ connected: false }));

  s.on('welcome', (w) => {
    live.setMap(w.map);
    live.others.clear();
    const people: Record<string, any> = {};
    for (const p of w.people) {
      const { x, y, dir, ...rest } = p;
      people[p.user.id] = rest;
      if (p.user.id === w.selfId) Object.assign(live.self, { x, y, dir, zone: p.zone });
      else live.others.set(p.user.id, { x, y, tx: x, ty: y, dir, tdir: dir, zone: p.zone });
    }
    set({ selfId: w.selfId, map: w.map, mapVersion: w.mapVersion, people, missed: w.missed, inOffice: true });
    voice.start(w.selfId, w.ice, (to, data) => s.emit('signal', { to, data }));
    music.start();
    s.emit('setMuted', voice.muted || useStore.getState().micState !== 'on'); // no mic = shown as muted
  });

  s.on('joined', (p) => {
    const { x, y, dir, ...rest } = p;
    live.others.set(p.user.id, { x, y, tx: x, ty: y, dir, tdir: dir, zone: p.zone });
    set((st) => ({ people: { ...st.people, [p.user.id]: rest } }));
  });
  s.on('left', (id) => {
    live.others.delete(id);
    set((st) => {
      const { [id]: _, ...people } = st.people;
      return { people, selectedId: st.selectedId === id ? null : st.selectedId };
    });
    if (live.followId === id) live.cancelWalk();
  });
  s.on('moved', (m) => {
    if (m.id === useStore.getState().selfId) { live.self.zone = m.zone; patchPerson(m.id, { zone: m.zone }); return; }
    const o = live.others.get(m.id);
    if (!o) return;
    o.tx = m.x; o.ty = m.y; o.tdir = m.dir; o.zone = m.zone;
    if (useStore.getState().people[m.id]?.zone !== m.zone) patchPerson(m.id, { zone: m.zone });
  });
  s.on('teleport', (m) => {
    live.self.x = m.x; live.self.y = m.y;
    if (m.dir !== undefined) live.self.dir = m.dir;
    live.cancelWalk();
  });
  s.on('status', (m) => patchPerson(m.id, { status: m.status }));
  s.on('muted', (m) => patchPerson(m.id, { muted: m.muted }));
  s.on('avatar', (m) => patchPerson(m.id, { avatar: m.avatar }));
  s.on('profile', (u) => {
    patchPerson(u.id, { user: u });
    if (u.id === useStore.getState().selfId) set((st) => ({ me: st.me ? { ...st.me, ...u } : st.me }));
  });
  s.on('raised', (m) => patchPerson(m.id, { raised: m.raised }));
  s.on('emote', (m) => {
    set((st) => ({ emotes: { ...st.emotes, [m.id]: { emote: m.emote, until: Date.now() + EMOTE_DURATION_MS } } }));
    setTimeout(() => set((st) => {
      if ((st.emotes[m.id]?.until ?? 0) > Date.now()) return st;
      const { [m.id]: _, ...emotes } = st.emotes;
      return { emotes };
    }), EMOTE_DURATION_MS + 50);
  });
  s.on('knock', (k) => {
    if (!k.silent) voice.knockSound();
    const toastRef = { id: 0 };
    toast(T.knockedYou(k.fromName), {
      actionLabel: T.goTo, ms: 12000,
      onAction: () => { walkToPerson(k.fromId); dismissToast(toastRef.id); },
    });
    toastRef.id = useStore.getState().toasts.at(-1)!.id;
  });
  s.on('missed', (k) => set((st) => ({ missed: [...st.missed, k] })));
  s.on('map', ({ map, version }) => {
    live.setMap(map);
    set({ map, mapVersion: version });
    toast(T.mapUpdated);
  });
  s.on('game', (g) => {
    set((st) => {
      const games = { ...st.games };
      if (g.view) games[g.tableId] = g; else delete games[g.tableId];
      const was = seatedTable(st);
      const seated = seatedTable({ games, selfId: st.selfId });
      live.seated = !!seated;
      let openTable = st.openTable === g.tableId && !g.view ? null : st.openTable;
      if (seated && !was) openTable = seated; // sitting down opens the table
      return { games, openTable };
    });
  });
  s.on('gameError', (code) => toast(T.gameErrors[code] ?? T.errorGeneric, { ms: 3500 }));
  s.on('signal', (m) => void voice.handleSignal(m.from, m.data as any));
  s.on('kicked', (reason) => {
    set({ kickedReason: reason, inOffice: false });
    leaveOffice();
  });
  s.on('connect_error', (e) => {
    if (e.message === 'unauthorized') set({ kickedReason: 'password_reset', inOffice: false });
  });
}

export function leaveOffice() {
  music.stop();
  voice.stop();
  socket?.disconnect();
  socket = null;
  live.others.clear();
  live.cancelWalk();
  live.seated = false;
  set({ games: {}, openTable: null, nearTable: null, inOffice: false, connected: false, people: {}, speaking: {}, emotes: {}, selectedId: null, micState: 'idle' });
}

export const walkToPerson = (id: string) => { live.followId = id; live.path = []; };

export const sendMove = (x: number, y: number, dir: number) => socket?.emit('move', { x, y, dir });
export const sendStatus = (s: Status) => socket?.emit('setStatus', s);
export const sendEmote = (e: Emote) => (e === 'raisehand' ? socket?.emit('raise', !useStore.getState().people[useStore.getState().selfId!]?.raised) : socket?.emit('emote', e));
export const sendKnock = (id: string) => {
  socket?.emit('knock', id);
  toast(T.knockSent(useStore.getState().people[id]?.user.displayName ?? ''), { ms: 2500 });
};
export const sendMuted = (m: boolean) => { voice.setMuted(m); socket?.emit('setMuted', m); };
export const clearMissed = () => { socket?.emit('clearMissed'); set({ missed: [] }); };
export const setMyAvatar = (a: AvatarConfig) => set({ myAvatar: a });
export const sendGameSit = (tableId: string) => socket?.emit('gameSit', tableId);
export const sendGameStand = () => socket?.emit('gameStand');
export const sendGameAct = (a: GameAction) => socket?.emit('gameAct', a);
