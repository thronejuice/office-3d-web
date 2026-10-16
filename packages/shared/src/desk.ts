import { DESK_AREA } from './constants';
import { CATALOG_BY_ID } from './catalog';
import { footprint, inBounds, TILE, validateForPublish, type Furniture, type MapData } from './map';

type Desk = MapData['desks'][number];

/** Floor tiles (as indices) a desk owner may decorate. */
export function deskArea(map: MapData, desk: Desk): Set<number> {
  const out = new Set<number>();
  const r = DESK_AREA.radius;
  for (let y = desk.y - r; y <= desk.y + r; y++)
    for (let x = desk.x - r; x <= desk.x + r; x++)
      if (inBounds(map, x, y) && map.tiles[y * map.width + x] === TILE.FLOOR) out.add(y * map.width + x);
  return out;
}

const inside = (map: MapData, area: Set<number>, f: Furniture) => footprint(f).every((p) => inBounds(map, p.x, p.y) && area.has(p.y * map.width + p.x));

/** Furniture the owner of `desk` can currently edit (fully inside the area). */
export const editableFurniture = (map: MapData, desk: Desk) => {
  const area = deskArea(map, desk);
  return map.furniture.filter((f) => inside(map, area, f));
};

/**
 * Replace the owner's editable furniture with `items`. Everything else stays untouched.
 * Returns a Thai error message when the result is not allowed.
 */
export function applyDeskEdit(map: MapData, userId: string, items: Furniture[]): { map: MapData } | { error: string } {
  const desk = map.desks.find((d) => d.userId === userId);
  if (!desk) return { error: 'คุณยังไม่มีโต๊ะประจำ' };
  const area = deskArea(map, desk);
  const kept = map.furniture.filter((f) => !inside(map, area, f));
  if (items.length > DESK_AREA.maxItems) return { error: 'วางของได้ไม่เกินจำนวนที่กำหนด' };
  const ids = new Set(kept.map((f) => f.id));
  for (const f of items) {
    if (ids.has(f.id)) return { error: 'รหัสเฟอร์นิเจอร์ซ้ำ' };
    ids.add(f.id);
    if (!CATALOG_BY_ID.has(f.type) || !inside(map, area, f)) return { error: 'วางได้เฉพาะบนพื้นในพื้นที่โต๊ะของคุณ' };
  }
  const taken = new Set<number>();
  const mark = (f: Furniture, check: boolean) => {
    if (!CATALOG_BY_ID.get(f.type)?.blocks) return false;
    for (const p of footprint(f)) {
      const i = p.y * map.width + p.x;
      if (check && taken.has(i)) return true;
      taken.add(i);
    }
    return false;
  };
  kept.forEach((f) => mark(f, false)); // pre-existing overlaps outside the area are not the owner's problem
  if (items.some((f) => mark(f, true))) return { error: 'เฟอร์นิเจอร์ซ้อนทับกัน' };
  const next = { ...map, furniture: [...kept, ...items] };
  const errs = validateForPublish(next);
  return errs.length ? { error: errs[0] } : { map: next };
}
