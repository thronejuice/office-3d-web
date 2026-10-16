import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CATALOG, CATALOG_BY_ID } from '@office3d/shared';
import { PROCEDURAL } from './Procedural';
import { rng } from './propKit';
import { TV_H, TV_SCENES, TV_W, nextScene, sceneSeconds } from './tvScenes';

describe('procedural furniture', () => {
  it('every procedural catalog item has a builder and every builder a catalog item', () => {
    const ids = CATALOG.filter((c) => c.procedural).map((c) => c.id).sort();
    expect(ids).toEqual(Object.keys(PROCEDURAL).sort());
  });

  it.each(Object.keys(PROCEDURAL))('%s stands on the floor and stays inside its footprint', (id) => {
    const cat = CATALOG_BY_ID.get(id)!;
    const box = new THREE.Box3().setFromObject(PROCEDURAL[id]());
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(box.max.y).toBeGreaterThan(0.5);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(cat.w / 2 + 1e-6);
    expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(cat.h / 2 + 1e-6);
  });
});

/** A canvas context stand-in that records what was drawn. */
function recorder() {
  const calls: Record<string, number> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; return k === 'createLinearGradient' ? { addColorStop: () => {} } : undefined; }),
    set: (t, k: string, v) => { t[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('TV pictures', () => {
  it.each(TV_SCENES.map((_, i) => i))('scene %i paints a full-screen background and nothing far outside it', (i) => {
    const { ctx, calls } = recorder();
    const rects: number[][] = [];
    (ctx as unknown as Record<string, unknown>).fillRect = (...a: number[]) => { calls.fillRect = (calls.fillRect ?? 0) + 1; rects.push(a); };
    TV_SCENES[i](ctx, rng(`scene${i}`));
    expect(calls.createLinearGradient ?? 0).toBeGreaterThan(0);
    expect(rects[0].slice(0, 4)).toEqual([0, rects[0][1], TV_W, rects[0][3]]); // the first thing drawn spans the full width
    expect(rects.every(([x, y]) => x < TV_W + 60 && y < TV_H + 20)).toBe(true); // a window on the last building may start just past the edge; the canvas clips it
  });

  it('is deterministic for a given random sequence', () => {
    const seq = (seed: number) => { let a = seed; return () => (a = (a * 16807) % 2147483647) / 2147483647; };
    const log = (i: number) => { const { ctx, calls } = recorder(); TV_SCENES[i](ctx, seq(7)); return JSON.stringify(calls); };
    TV_SCENES.forEach((_, i) => expect(log(i)).toBe(log(i)));
  });

  it('never repeats the picture just shown and reaches them all', () => {
    let prev = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const n = nextScene(prev);
      expect(n).not.toBe(prev);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(TV_SCENES.length);
      seen.add(n);
      prev = n;
    }
    expect(seen.size).toBe(TV_SCENES.length);
  });

  it('keeps each picture up for 8 to 14 seconds', () => {
    expect(sceneSeconds(() => 0)).toBe(8);
    expect(sceneSeconds(() => 0.999)).toBeLessThan(14);
  });
});
