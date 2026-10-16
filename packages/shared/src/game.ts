import type { Furniture, MapData } from './map';
import type { GameId, MusicTrack, ZoneKind } from './constants';
import { walkGrid, inBounds, footprint } from './map';

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = { meeting: 'ห้องประชุม', music: 'ฟังเพลง', game: 'เล่นเกม' };

export const MUSIC_LABEL: Record<MusicTrack, string> = { rain: 'ฝนตก', forest: 'ป่าและเสียงนก', sea: 'คลื่นทะเล', stream: 'ลำธาร / น้ำตก' };
export const MUSIC = { fadeSeconds: 1.5, defaultVolume: 0.5 } as const;

export const GAME_LABEL: Record<GameId, string> = { poker: 'โป๊กเกอร์ (Texas Hold\'em)', chess: 'หมากรุก', uno: 'ยูโน (Uno)', pokdeng: 'ป๊อกเด้ง', bingo: 'บิงโก' };
/** Furniture type that is the table for each game. */
export const GAME_TABLE: Record<GameId, string> = { poker: 'gameTable', chess: 'chessTable', uno: 'unoTable', pokdeng: 'pokdengTable', bingo: 'bingoTable' };
export const gameForTable = (type: string): GameId | undefined => (Object.keys(GAME_TABLE) as GameId[]).find((g) => GAME_TABLE[g] === type);

/** How close (in tiles) to the table's edge a player must stand to sit down. */
export const SIT_DISTANCE = 2.5;

export const zoneKind = (z: { kind?: ZoneKind }): ZoneKind => z.kind ?? 'meeting';

export interface Seat { x: number; y: number; dir: number } // tile center + facing (radians, same convention as avatars)

/** Seats around a game table: one tile outside each long side, facing the table. Only walkable, in-bounds tiles count. */
export function tableSeats(map: MapData, f: Furniture): Seat[] {
  const cells = footprint(f);
  if (!cells.length) return [];
  const g = walkGrid({ ...map, furniture: map.furniture.filter((o) => o.id !== f.id) });
  const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const out: Seat[] = [];
  const add = (x: number, y: number, dx: number, dy: number) => {
    if (inBounds(map, x, y) && g[y * map.width + x] === 1) out.push({ x: x + 0.5, y: y + 0.5, dir: Math.atan2(dx, dy) });
  };
  const midX = Math.floor((x0 + x1) / 2), midY = Math.floor((y0 + y1) / 2);
  if (f.game === 'uno' || f.game === 'pokdeng' || f.game === 'bingo') {
    // round table: two seats on the top and bottom sides, one on each end
    add(x0, y0 - 1, 0, 1); add(x1, y0 - 1, 0, 1); add(x0, y1 + 1, 0, -1); add(x1, y1 + 1, 0, -1);
    add(x0 - 1, y0, 1, 0); add(x1 + 1, y1, -1, 0);
  } else if (f.game === 'chess') {
    // two players face each other across the middle of the table
    if (f.rot % 2 === 0) { add(midX, y0 - 1, 0, 1); add(midX, y1 + 1, 0, -1); }
    else { add(x0 - 1, midY, 1, 0); add(x1 + 1, midY, -1, 0); }
  } else if (f.rot % 2 === 0) for (let x = x0; x <= x1; x++) { add(x, y0 - 1, 0, 1); add(x, y1 + 1, 0, -1); }
  else for (let y = y0; y <= y1; y++) { add(x0 - 1, y, 1, 0); add(x1 + 1, y, -1, 0); }
  return out;
}

export const gameTables = (map: MapData) => map.furniture.filter((f) => f.game);
