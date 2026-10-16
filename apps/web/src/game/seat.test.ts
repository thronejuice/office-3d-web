import { describe, expect, it } from 'vitest';
import { seatAt, gameSeatChairs, CHAIR_FACING, SEAT_HEIGHT } from './seat';
import { createSeedMap, tableSeats, gameTables } from '@office3d/shared';
import type { MapData } from '@office3d/shared';

describe('seatAt', () => {
  const map: MapData = {
    width: 10,
    height: 10,
    tiles: new Array(100).fill(1),
    furniture: [
      { id: 'c1', type: 'chairDesk', x: 2, y: 3, rot: 0 },
      { id: 'c2', type: 'chair', x: 5, y: 5, rot: 2 },
      { id: 't', type: 'table', x: 7, y: 7, rot: 1 },
      { id: 's', type: 'loungeSofa', x: 1, y: 8, rot: 0 }, // 2x1: covers (1,8) and (2,8)
      { id: 'b', type: 'bench', x: 4, y: 1, rot: 1 }, // 2x1 turned: covers (4,1) and (4,2)
    ],
    zones: [],
    desks: [],
    spawn: { x: 0, y: 0 },
  } as unknown as MapData;

  it('gives facing and seat height for a chair, also at float coordinates', () => {
    expect(seatAt(map, 2, 3)).toEqual({ angle: CHAIR_FACING, y: SEAT_HEIGHT.chairDesk });
    expect(seatAt(map, 5.25, 5.8)).toEqual({ angle: Math.PI + CHAIR_FACING, y: SEAT_HEIGHT.chair });
  });

  it('covers every tile of a multi-tile sofa and a rotated bench', () => {
    expect(seatAt(map, 1.5, 8.5)?.y).toBe(SEAT_HEIGHT.loungeSofa);
    expect(seatAt(map, 2.5, 8.5)?.y).toBe(SEAT_HEIGHT.loungeSofa);
    expect(seatAt(map, 3.5, 8.5)).toBeNull();
    expect(seatAt(map, 4.5, 2.5)).toEqual({ angle: Math.PI / 2 + CHAIR_FACING, y: SEAT_HEIGHT.bench });
  });

  it('returns null for non-seat furniture, empty tiles and a missing map', () => {
    expect(seatAt(map, 7, 7)).toBeNull();
    expect(seatAt(map, 0, 0)).toBeNull();
    expect(seatAt(null, 2, 3)).toBeNull();
    expect(seatAt(undefined, 2, 3)).toBeNull();
  });
});

describe('gameSeatChairs', () => {
  const m = createSeedMap();
  it('puts one chair on every seat of every game table, facing the table', () => {
    const chairs = gameSeatChairs(m);
    const seats = gameTables(m).flatMap((t) => tableSeats(m, t));
    expect(seats.length).toBeGreaterThan(0);
    expect(chairs).toHaveLength(seats.length);
    seats.forEach((s, i) => {
      expect([chairs[i].x, chairs[i].y]).toEqual([Math.floor(s.x), Math.floor(s.y)]);
      expect(chairs[i].rot * (Math.PI / 2) + CHAIR_FACING).toBeCloseTo(((s.dir % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    });
  });

  it('skips a seat that already has a chair', () => {
    const t = gameTables(m)[0];
    const s = tableSeats(m, t)[0];
    const withChair = { ...m, furniture: [...m.furniture, { id: 'real', type: 'chair', x: Math.floor(s.x), y: Math.floor(s.y), rot: 0 as const }] };
    expect(gameSeatChairs(withChair)).toHaveLength(gameSeatChairs(m).length - 1);
  });
});
