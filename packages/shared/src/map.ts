import { z } from 'zod';
import { CATALOG_BY_ID } from './catalog';
import { GAMES, ZONE_KINDS, MUSIC_TRACKS, MAP_LIMITS } from './constants';

export const TILE = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3 } as const;

const pt = z.object({ x: z.number().int(), y: z.number().int() });

export const mapSchema = z
  .object({
    width: z.number().int().min(MAP_LIMITS.minSize).max(MAP_LIMITS.maxSize),
    height: z.number().int().min(MAP_LIMITS.minSize).max(MAP_LIMITS.maxSize),
    tiles: z.array(z.number().int().min(0).max(3)),
    furniture: z.array(
      z.object({
        id: z.string().min(1).max(40),
        type: z.string().refine((t) => CATALOG_BY_ID.has(t), 'unknown furniture type'),
        x: z.number().int(),
        y: z.number().int(),
        rot: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
        game: z.enum(GAMES).optional(), // only for game tables
      }),
    ),
    zones: z.array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(60),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        tiles: z.array(z.number().int().min(0)), // tile indices (y * width + x)
        kind: z.enum(ZONE_KINDS).optional(), // missing = meeting
        track: z.enum(MUSIC_TRACKS).optional(), // music zones only
      }),
    ),
    desks: z.array(z.object({ id: z.string().min(1).max(40), x: z.number().int(), y: z.number().int(), userId: z.string().nullable() })),
    spawn: pt,
  })
  .superRefine((m, ctx) => {
    if (m.tiles.length !== m.width * m.height) ctx.addIssue({ code: 'custom', message: 'tiles length must equal width*height' });
  });
export type MapData = z.infer<typeof mapSchema>;
export type Furniture = MapData['furniture'][number];

export const inBounds = (m: { width: number; height: number }, x: number, y: number) =>
  x >= 0 && y >= 0 && x < m.width && y < m.height;

/** Tiles covered by a furniture piece (rotation swaps footprint). */
export function footprint(f: Furniture): { x: number; y: number }[] {
  const c = CATALOG_BY_ID.get(f.type);
  if (!c) return [];
  const [w, h] = f.rot % 2 ? [c.h, c.w] : [c.w, c.h];
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: f.x + dx, y: f.y + dy });
  return out;
}

/** 1 = walkable. Floor/door tiles not covered by blocking furniture. */
export function walkGrid(m: MapData): Uint8Array {
  const g = new Uint8Array(m.width * m.height);
  for (let i = 0; i < g.length; i++) g[i] = m.tiles[i] === TILE.FLOOR || m.tiles[i] === TILE.DOOR ? 1 : 0;
  for (const f of m.furniture) {
    if (!CATALOG_BY_ID.get(f.type)?.blocks) continue;
    for (const p of footprint(f)) if (inBounds(m, p.x, p.y)) g[p.y * m.width + p.x] = 0;
  }
  return g;
}

/** Per-tile zone id (or null). */
export function zoneGrid(m: MapData): (string | null)[] {
  const g: (string | null)[] = new Array(m.width * m.height).fill(null);
  for (const z of m.zones) for (const i of z.tiles) if (i < g.length) g[i] = z.id;
  return g;
}

export const isWalkablePos = (g: Uint8Array, m: { width: number; height: number }, x: number, y: number) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  return inBounds(m, tx, ty) && g[ty * m.width + tx] === 1;
};

/** Can a body of `radius` stand at (x,y)? Checks the four corners. */
export function canStand(g: Uint8Array, m: { width: number; height: number }, x: number, y: number, radius: number): boolean {
  return (
    isWalkablePos(g, m, x - radius, y - radius) &&
    isWalkablePos(g, m, x + radius, y - radius) &&
    isWalkablePos(g, m, x - radius, y + radius) &&
    isWalkablePos(g, m, x + radius, y + radius)
  );
}

/** Nearest walkable tile center to (x,y), by BFS over the whole grid. */
export function nearestWalkable(g: Uint8Array, m: { width: number; height: number }, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let ty = 0; ty < m.height; ty++)
    for (let tx = 0; tx < m.width; tx++)
      if (g[ty * m.width + tx] === 1) {
        const d = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
        if (d < bestD) { bestD = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
      }
  return best;
}

/** Publish-time validation. Returns Thai error messages; empty = valid. */
export function validateForPublish(m: MapData): string[] {
  const errs: string[] = [];
  const g = walkGrid(m);
  const ok = (x: number, y: number) => inBounds(m, x, y) && g[y * m.width + x] === 1;
  if (!ok(m.spawn.x, m.spawn.y)) {
    errs.push('จุดเกิดต้องอยู่บนช่องที่เดินได้');
    return errs;
  }
  const seen = new Uint8Array(g.length);
  const q = [m.spawn.y * m.width + m.spawn.x];
  seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const cx = q[i] % m.width, cy = Math.floor(q[i] / m.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (ok(nx, ny) && !seen[ny * m.width + nx]) { seen[ny * m.width + nx] = 1; q.push(ny * m.width + nx); }
    }
  }
  const seenUsers = new Set<string>();
  for (const d of m.desks) {
    if (!ok(d.x, d.y)) errs.push(`จุดโต๊ะ (${d.x},${d.y}) ต้องอยู่บนช่องที่เดินได้`);
    else if (!seen[d.y * m.width + d.x]) errs.push(`จุดโต๊ะ (${d.x},${d.y}) เดินไปจากจุดเกิดไม่ได้`);
    if (d.userId) {
      if (seenUsers.has(d.userId)) errs.push('ผู้ใช้หนึ่งคนมีโต๊ะได้เพียงหนึ่งจุด');
      seenUsers.add(d.userId);
    }
  }
  return errs;
}
