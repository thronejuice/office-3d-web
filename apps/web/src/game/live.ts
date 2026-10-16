import { walkGrid, zoneGrid, type MapData } from '@office3d/shared';

export interface Live { x: number; y: number; tx: number; ty: number; dir: number; tdir: number; zone: string | null }

/** Mutable, per-frame world state shared by the renderer, movement, and voice. */
export const live = {
  self: { x: 0, y: 0, dir: 0, zone: null as string | null },
  others: new Map<string, Live>(),
  map: null as MapData | null,
  grid: new Uint8Array(0) as Uint8Array,
  zones: [] as (string | null)[],
  // set by click/tap, walk-to-friend; consumed by LocalPlayer
  path: [] as { x: number; y: number }[],
  followId: null as string | null,
  seated: false, // sitting at a game table: movement is locked
  setMap(m: MapData) {
    this.map = m;
    this.grid = walkGrid(m);
    this.zones = zoneGrid(m);
  },
  zoneAt(x: number, y: number): string | null {
    const m = this.map;
    return m ? this.zones[Math.floor(y) * m.width + Math.floor(x)] ?? null : null;
  },
  cancelWalk() { this.path = []; this.followId = null; },
};
