import { describe, expect, it } from 'vitest';
import { rng } from './propKit';
import { POSTERS, POSTER_H, POSTER_W, paintPoster, paintView } from './wallArt';

function recorder() {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(`${k}(${a.join(',')})`); return k === 'createLinearGradient' ? { addColorStop: () => {} } : undefined; }),
    set: (t, k: string, v) => { t[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe('wall art', () => {
  it.each(POSTERS.map((_, i) => i))('poster design %i fills the poster and prints a title', (i) => {
    const { ctx, calls } = recorder();
    POSTERS[i](ctx, rng('x'));
    expect(calls.some((c) => c.startsWith('fillRect(0,0,' + POSTER_W + ',' + POSTER_H))).toBe(true);
    expect(calls.filter((c) => c.startsWith('fillText'))).toHaveLength(1);
  });

  it('a piece shows the same picture every time for the same id, and ids differ', () => {
    const run = (paint: typeof paintPoster, id: string) => { const { ctx, calls } = recorder(); paint(ctx, rng(id)); return calls.join('|'); };
    for (const paint of [paintPoster, paintView]) {
      expect(run(paint, 'f12')).toBe(run(paint, 'f12'));
      expect(new Set(Array.from({ length: 20 }, (_, i) => run(paint, `f${i}`))).size).toBeGreaterThan(5);
    }
  });
});
