import { footprint, gameTables, tableSeats, type Furniture, type MapData } from '@office3d/shared';

/**
 * Seat surface height (world units) of every furniture type an avatar can sit on, measured from the GLBs
 * after Furniture.tsx scales them. Barstools (1.35) are left out: they are as tall as the avatar.
 */
export const SEAT_HEIGHT: Record<string, number> = {
  chairDesk: 0.6,
  chair: 0.75,
  loungeSofa: 0.45,
  loungeSofaLong: 0.45,
  loungeChair: 0.45,
  bench: 0.75,
};

/** Chair models (and avatars at dir 0) look towards +z at rot 0, measured from the GLBs. */
export const CHAIR_FACING = 0;

/**
 * The seat under (x, y): `angle` is where a sitter faces, `y` the seat surface height.
 * Null when no sittable furniture covers that tile.
 */
export function seatAt(map: MapData | null | undefined, x: number, y: number): { angle: number; y: number } | null {
  if (!map?.furniture) return null;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  for (const f of map.furniture) {
    const h = SEAT_HEIGHT[f.type];
    if (h !== undefined && footprint(f).some((c) => c.x === tx && c.y === ty)) return { angle: f.rot * (Math.PI / 2) + CHAIR_FACING, y: h };
  }
  return null;
}

/**
 * Chairs to draw at the seats around every game table (the seats are derived, so the map has no chair there).
 * A seat that already has a real chair or sofa under it gets none. Chair models face +z at rot 0.
 */
export function gameSeatChairs(map: MapData): Furniture[] {
  const out: Furniture[] = [];
  for (const t of gameTables(map))
    tableSeats(map, t).forEach((s, i) => {
      if (seatAt(map, s.x, s.y)) return;
      const rot = (((Math.round(s.dir / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
      out.push({ id: `seat-${t.id}-${i}`, type: 'chair', x: Math.floor(s.x), y: Math.floor(s.y), rot });
    });
  return out;
}
