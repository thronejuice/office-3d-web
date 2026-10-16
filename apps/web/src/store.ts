import { create } from 'zustand';
import type { AvatarConfig, Emote, GameState, MapData, MissedKnock, Presence, PublicUser, Status } from '@office3d/shared';

export interface Me extends PublicUser { disabled: boolean; mustChangePassword: boolean }
export type Panel = 'none' | 'online' | 'missed' | 'devices' | 'customize';
export interface Toast { id: number; text: string; actionLabel?: string; onAction?: () => void; ms?: number }

/** Low-frequency state. Positions live in game/live.ts to avoid re-rendering at 10 Hz. */
export interface Person extends Omit<Presence, 'x' | 'y' | 'dir'> {}

interface State {
  me: Me | null;
  myAvatar: AvatarConfig | null;
  authReady: boolean;
  selfId: string | null;
  connected: boolean;
  inOffice: boolean;
  kickedReason: string | null;
  map: MapData | null;
  mapVersion: number;
  people: Record<string, Person>;
  emotes: Record<string, { emote: Emote; until: number }>;
  speaking: Record<string, boolean>;
  missed: MissedKnock[];
  toasts: Toast[];
  panel: Panel;
  selectedId: string | null;
  hoverId: string | null;
  deskArea: number[] | null; // tiles being decorated while the desk editor is open
  micState: 'idle' | 'on' | 'denied' | 'none' | 'insecure';
  zoomStep: number; // -1 | 0 | 1, see ZOOM_MULT
  viewRot: number; // camera turns of 90° (counts up and down without wrapping so the camera takes the short way round)
  musicTrack: string | null; // nature track of the music zone we stand in
  musicVolume: number;
  musicOff: boolean;
  games: Record<string, GameState>; // game tables by furniture id, as this user may see them
  openTable: string | null; // table whose panel is open
  nearTable: string | null; // table within sitting distance, for the HUD button
  set: (p: Partial<State>) => void;
}

const readStr = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const readNum = (k: string, d: number) => { const v = Number(readStr(k) ?? d); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d; };

/** Camera zoom is limited to three fixed steps; the camera can be turned in 90° steps (see stepRot). */
export const ZOOM_MULT = [0.75, 1, 1.4];
const ZOOM_KEY = 'office3d.zoom';
function readZoom() {
  try { const v = Number(localStorage.getItem(ZOOM_KEY)); return v === -1 || v === 1 ? v : 0; } catch { return 0; }
}
export function stepZoom(d: 1 | -1) {
  const z = Math.max(-1, Math.min(1, useStore.getState().zoomStep + d));
  useStore.setState({ zoomStep: z });
  try { localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* private mode: zoom just won't persist */ }
}

const ROT_KEY = 'office3d.rot';
function readRot() {
  try { const v = Number(localStorage.getItem(ROT_KEY)); return Number.isInteger(v) ? v : 0; } catch { return 0; }
}
export function stepRot(d: 1 | -1) {
  const r = useStore.getState().viewRot + d;
  useStore.setState({ viewRot: r });
  try { localStorage.setItem(ROT_KEY, String(((r % 4) + 4) % 4)); } catch { /* private mode: rotation just won't persist */ }
}

export const useStore = create<State>((set) => ({
  me: null, myAvatar: null, authReady: false, selfId: null, connected: false, inOffice: false, kickedReason: null,
  map: null, mapVersion: 0, people: {}, emotes: {}, speaking: {}, missed: [], toasts: [],
  panel: 'none', selectedId: null, hoverId: null, deskArea: null, micState: 'idle', zoomStep: readZoom(), viewRot: readRot(), games: {}, openTable: null, nearTable: null, musicTrack: null, musicVolume: readNum('office3d.musicVolume', 0.5), musicOff: readStr('office3d.musicOff') === '1',
  set: (p) => set(p),
}));

export const patchPerson = (id: string, p: Partial<Person>) =>
  useStore.setState((s) => (s.people[id] ? { people: { ...s.people, [id]: { ...s.people[id], ...p } } } : s));

let toastId = 0;
export function toast(text: string, opts: Partial<Toast> = {}) {
  const t: Toast = { id: ++toastId, text, ms: 5000, ...opts };
  useStore.setState((s) => ({ toasts: [...s.toasts, t] }));
  if (t.ms) setTimeout(() => dismissToast(t.id), t.ms);
}
/** Which table (if any) this user currently sits at. */
export function seatedTable(st: { games: Record<string, GameState>; selfId: string | null }): string | null {
  for (const g of Object.values(st.games)) if (g.view?.seats.some((s) => s && s.userId === st.selfId && !('leaving' in s && s.leaving))) return g.tableId;
  return null;
}

export const dismissToast = (id: number) => useStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

export type { Status };
