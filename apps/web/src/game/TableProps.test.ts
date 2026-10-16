import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GAME_TABLE } from '@office3d/shared';
import { buildTableProps, deskExtras } from './TableProps';

// half the table top (scaled models): poker 1.76 x 0.95, chess side table 0.93 x 0.39, round tables ~1.6 across
const LIMIT: Record<string, [number, number]> = {
  [GAME_TABLE.poker]: [0.88, 0.47],
  [GAME_TABLE.chess]: [0.19, 0.19],
  [GAME_TABLE.uno]: [0.6, 0.6],
  [GAME_TABLE.pokdeng]: [0.6, 0.6],
  [GAME_TABLE.bingo]: [0.6, 0.6],
};

describe('buildTableProps', () => {
  it.each(Object.keys(LIMIT))('%s has props that lie on the table surface and inside its edges', (type) => {
    const g = buildTableProps(type)!;
    let meshes = 0;
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
    expect(meshes).toBeGreaterThan(4);
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(LIMIT[type][0]);
    expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(LIMIT[type][1]);
  });

  it('gives every game a different look and nothing to other furniture', () => {
    const sig = Object.keys(LIMIT).map((t) => { const cs = new Set<string>(); buildTableProps(t)!.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m) cs.add(m.color.getHexString()); }); return [...cs].sort().join(); });
    expect(new Set(sig).size).toBe(sig.length);
    expect(buildTableProps('chair')).toBeNull();
  });

  it('puts a TV on the TV cabinet inside its top (1.88 x 0.59 scaled)', () => {
    const g = buildTableProps('cabinetTelevision')!;
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(0.94);
    expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(0.3);
    expect(box.max.y).toBeGreaterThan(0.5);
  });

  it('gives every desk a laptop, a second monitor and a keyboard inside the desk top (1.76 x 0.94)', () => {
    for (const id of ['f1', 'f5', 'f9', 'desk-7']) {
      const g = buildTableProps('desk', id)!;
      const box = new THREE.Box3().setFromObject(g);
      expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
      expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(0.88);
      expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(0.47);
      let meshes = 0;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes).toBeGreaterThanOrEqual(9); // laptop 3 + lid 2 + monitor 4 + keyboard 1
    }
  });

  it('picks the optional desk items from the id: stable, varied, and each item shows up on some desks but not all', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `f${i + 1}`);
    ids.forEach((id) => expect(deskExtras(id)).toEqual(deskExtras(id)));
    for (const k of ['doll', 'cup', 'speaker'] as const) {
      const n = ids.filter((id) => deskExtras(id)[k]).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(ids.length);
    }
    const mesh = (id: string) => { let n = 0; buildTableProps('desk', id)!.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
    expect(new Set(ids.map(mesh)).size).toBeGreaterThan(1);
  });
});
