import { describe, expect, it } from 'vitest';
import { audibleGain, gainForDistance, shouldConnect, type VoiceParty } from './voice';
import { findPath } from './pathfinding';
import { createSeedMap } from './seedMap';
import { mapSchema, validateForPublish, walkGrid, TILE, footprint } from './map';

const P = (x: number, y: number, zone: string | null = null, status: VoiceParty['status'] = 'available'): VoiceParty => ({ x, y, zone, status });

describe('gainForDistance', () => {
  it('is 1 within 2, 0 from 6, linear between', () => {
    expect(gainForDistance(0)).toBe(1);
    expect(gainForDistance(2)).toBe(1);
    expect(gainForDistance(4)).toBeCloseTo(0.5);
    expect(gainForDistance(6)).toBe(0);
    expect(gainForDistance(20)).toBe(0);
  });
});

describe('audibleGain (zones + DND)', () => {
  it('same zone is full volume at any distance', () => expect(audibleGain(P(0, 0, 'z'), P(10, 0, 'z'))).toBe(1));
  it('zone wall blocks audio both ways', () => {
    expect(audibleGain(P(0, 0, 'z'), P(1, 0))).toBe(0);
    expect(audibleGain(P(0, 0), P(1, 0, 'z'))).toBe(0);
    expect(audibleGain(P(0, 0, 'a'), P(1, 0, 'b'))).toBe(0);
  });
  it('DND silences open floor but not the same zone', () => {
    expect(audibleGain(P(0, 0, null, 'dnd'), P(1, 0))).toBe(0);
    expect(audibleGain(P(0, 0, 'z', 'dnd'), P(5, 0, 'z'))).toBe(1);
  });
  it('busy and away do not change audio', () => {
    expect(audibleGain(P(0, 0, null, 'busy'), P(1, 0))).toBe(1);
    expect(audibleGain(P(0, 0, null, 'away'), P(1, 0))).toBe(1);
  });
});

describe('shouldConnect hysteresis', () => {
  it('connects within 7, stays until 9', () => {
    expect(shouldConnect(P(0, 0), P(7.5, 0), false)).toBe(false);
    expect(shouldConnect(P(0, 0), P(6.9, 0), false)).toBe(true);
    expect(shouldConnect(P(0, 0), P(8.5, 0), true)).toBe(true);
    expect(shouldConnect(P(0, 0), P(9.1, 0), true)).toBe(false);
  });
  it('zone rules override distance', () => {
    expect(shouldConnect(P(0, 0, 'z'), P(30, 0, 'z'), false)).toBe(true);
    expect(shouldConnect(P(0, 0, 'z'), P(1, 0), true)).toBe(false);
    expect(shouldConnect(P(0, 0, 'a'), P(1, 0, 'b'), true)).toBe(false);
  });
  it('DND disconnects on the open floor', () => expect(shouldConnect(P(0, 0, null, 'dnd'), P(1, 0), true)).toBe(false));
});

describe('findPath', () => {
  const w = 5, h = 5;
  const open = new Uint8Array(w * h).fill(1);
  it('finds a straight path', () => expect(findPath(open, w, h, { x: 0, y: 0 }, { x: 4, y: 4 })!.length).toBe(5));
  it('routes around walls and returns null when sealed', () => {
    const g = open.slice();
    for (let y = 0; y < 4; y++) g[y * w + 2] = 0;
    expect(findPath(g, w, h, { x: 0, y: 0 }, { x: 4, y: 0 })!.some((p) => p.y === 4)).toBe(true);
    g[4 * w + 2] = 0;
    expect(findPath(g, w, h, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeNull();
  });
  it('does not cut corners', () => {
    const g = open.slice();
    g[0 * w + 1] = 0; g[1 * w + 0] = 0;
    expect(findPath(g, w, h, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
});

describe('map schema + publish validation', () => {
  it('seed map is valid and publishable', () => {
    const m = createSeedMap();
    expect(mapSchema.safeParse(m).success).toBe(true);
    expect(validateForPublish(m)).toEqual([]);
    expect(m.desks.length).toBe(10);
  });
  it('rejects bad tile count / unknown furniture', () => {
    const m = createSeedMap();
    expect(mapSchema.safeParse({ ...m, tiles: [1] }).success).toBe(false);
    expect(mapSchema.safeParse({ ...m, furniture: [{ id: 'x', type: 'nope', x: 0, y: 0, rot: 0 }] }).success).toBe(false);
  });
  it('rejects unwalkable spawn, unreachable desk, duplicate desk user', () => {
    const m = createSeedMap();
    expect(validateForPublish({ ...m, spawn: { x: 0, y: 0 } }).length).toBe(1);
    const sealed = { ...m, desks: [...m.desks, { id: 'dx', x: 20, y: 25, userId: null }], tiles: m.tiles.slice() };
    for (const x of [12, 30]) sealed.tiles[19 * m.width + x] = TILE.WALL;
    expect(validateForPublish(sealed).some((e) => e.includes('เดินไปจากจุดเกิดไม่ได้'))).toBe(true);
    const dup = { ...m, desks: [{ ...m.desks[0], userId: 'u' }, { ...m.desks[1], userId: 'u' }] };
    expect(validateForPublish(dup).length).toBe(1);
  });
  it('blocking furniture removes walkability', () => {
    const m = createSeedMap();
    const g = walkGrid(m);
    expect(g[3 * m.width + 3]).toBe(0); // desk tile
    expect(g[4 * m.width + 3]).toBe(1); // chair tile (desk spot)
  });
});

import { applyDeskEdit, deskArea, editableFurniture } from './desk';
describe('desk edit by owner', () => {
  const base = createSeedMap();
  const m = { ...base, desks: base.desks.map((d, i) => (i === 0 ? { ...d, userId: 'u1' } : d)) };
  const desk = m.desks[0];
  it('owner can edit own desk items, but not others', () => {
    const mine = editableFurniture(m, desk);
    expect(mine.map((f) => f.type)).toContain('desk');
    const r = applyDeskEdit(m, 'u1', [...mine, { id: 'new', type: 'pottedPlant', x: desk.x + 1, y: desk.y + 1, rot: 0 }]);
    expect(r).toHaveProperty('map');
    const other = m.furniture.find((f) => f.x === 7 && f.type === 'desk')!;
    expect('map' in r && r.map.furniture.some((f) => f.id === other.id)).toBe(true);
  });
  it('rejects outside area, overlap, blocking own spot and users without a desk', () => {
    const mine = editableFurniture(m, desk);
    expect('error' in applyDeskEdit(m, 'u1', [...mine, { id: 'a', type: 'pottedPlant', x: 15, y: 18, rot: 0 }])).toBe(true);
    expect('error' in applyDeskEdit(m, 'u1', [...mine, { id: 'b', type: 'pottedPlant', x: desk.x, y: desk.y - 1, rot: 0 }])).toBe(true);
    expect('error' in applyDeskEdit(m, 'u1', [...mine, { id: 'c', type: 'pottedPlant', x: desk.x, y: desk.y, rot: 0 }])).toBe(true); // blocks the desk spot
    expect('error' in applyDeskEdit(m, 'nobody', mine)).toBe(true);
    expect(deskArea(m, desk).size).toBeGreaterThan(0);
  });
});

import { gameTables, tableSeats, zoneKind } from './game';

describe('zones and game tables in the seed map', () => {
  const m = createSeedMap();
  it('is valid and has one zone of each kind', () => {
    expect(mapSchema.safeParse(m).success).toBe(true);
    expect(m.zones.map(zoneKind).sort()).toEqual(['game', 'meeting', 'meeting', 'music']);
    expect(m.zones.find((z) => z.kind === 'music')!.track).toBe('forest');
  });
  it('each meeting room has a TV facing its table and two speakers, all inside the room', () => {
    for (const z of m.zones.filter((z) => zoneKind(z) === 'meeting')) {
      const inRoom = (f: { x: number; y: number }) => z.tiles.includes(f.y * m.width + f.x);
      const tvs = m.furniture.filter((f) => f.type === 'cabinetTelevision' && inRoom(f));
      expect(tvs).toHaveLength(1);
      expect(tvs[0].rot).toBe(3); // faces -x, towards the table
      expect(m.furniture.filter((f) => f.type === 'speaker' && inRoom(f))).toHaveLength(2);
    }
  });
  it('the music corner has a jukebox and instruments, the lounge a big TV the sofas face', () => {
    const music = m.zones.find((z) => z.kind === 'music')!;
    const inZone = (f: { x: number; y: number }) => music.tiles.includes(f.y * m.width + f.x);
    for (const type of ['jukebox', 'piano', 'guitar', 'drums']) expect(m.furniture.some((f) => f.type === type && inZone(f)), type).toBe(true);
    const tv = m.furniture.find((f) => f.type === 'bigTv')!;
    const sofas = m.furniture.filter((f) => f.type === 'loungeSofa');
    expect(tv.rot).toBe(0); // faces +z, away from the north wall
    expect(sofas.length).toBeGreaterThan(0);
    for (const s of sofas) {
      expect(s.y).toBeGreaterThan(tv.y); // south of the TV...
      expect(s.rot).toBe(2); // ...turned to face it (-z)
    }
  });
  it('wall pictures hang on a floor tile whose back edge touches a wall (rot 0: wall to the north, rot 1: wall to the west)', () => {
    const art = m.furniture.filter((f) => f.type === 'poster' || f.type === 'painting');
    expect(art.length).toBeGreaterThanOrEqual(6);
    for (const f of art) {
      const wall = (x: number, y: number) => m.tiles[y * m.width + x] === TILE.WALL;
      expect(f.rot === 0 || f.rot === 1, f.id).toBe(true);
      for (const c of footprint(f)) {
        expect(m.tiles[c.y * m.width + c.x], `${f.id} on floor`).toBe(TILE.FLOOR);
        expect(f.rot === 0 ? wall(c.x, c.y - 1) : wall(c.x - 1, c.y), `${f.id} against a wall`).toBe(true);
      }
    }
    // some hang in the lounge and some in the music corner
    const zone = (k: string) => m.zones.find((z) => z.kind === k)!;
    expect(art.some((f) => zone('music').tiles.includes(f.y * m.width + f.x + 1))).toBe(true);
    expect(art.some((f) => f.y >= 20)).toBe(true);
  });
  it('old maps without a zone kind count as meeting rooms', () => {
    expect(zoneKind({})).toBe('meeting');
  });
  it('poker tables have six walkable seats and the chess table two, all facing the table, and the map publishes cleanly', () => {
    const tables = gameTables(m);
    expect(tables.map((f) => f.game).sort()).toEqual(['bingo', 'chess', 'pokdeng', 'poker', 'poker', 'uno']);
    for (const f of tables) {
      const seats = tableSeats(m, f);
      expect(seats.length).toBe(f.game === 'chess' ? 2 : 6); // every other game seats six
      for (const s of seats) expect(Math.abs(Math.cos(s.dir))).toBeLessThan(1.01);
    }
    const chess = tableSeats(m, tables.find((f) => f.game === 'chess')!);
    expect(chess[0].x).toBe(chess[1].x); // same file, one on each side
    expect(chess[0].y).toBeLessThan(chess[1].y);
    expect(validateForPublish(m)).toEqual([]);
  });
  it('a blocked seat tile is dropped', () => {
    const f = gameTables(m).find((x) => x.game === 'poker')!;
    const blocked = { ...m, furniture: [...m.furniture, { id: 'x', type: 'pottedPlant', x: f.x, y: f.y - 1, rot: 0 as const }] };
    expect(tableSeats(blocked, f).length).toBe(5);
  });
});
