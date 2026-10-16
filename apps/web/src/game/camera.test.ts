import { describe, expect, it } from 'vitest';
import { viewToWorld, toUnturned } from './camera';

const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));
const k = Math.SQRT1_2;

describe('viewToWorld', () => {
  it('keeps the original mapping at angle 0: up is (-1,-1), right is (+1,-1)', () => {
    near(viewToWorld(0, -1, 0), [-k, -k]);
    near(viewToWorld(1, 0, 0), [k, -k]);
  });
  it('turns "up" with the camera: after one quarter turn up is (-1,+1)', () => {
    near(viewToWorld(0, -1, Math.PI / 2), [-k, k]);
    near(viewToWorld(0, -1, Math.PI), [k, k]);
    near(viewToWorld(0, -1, 2 * Math.PI), [-k, -k]);
  });
  it('right stays perpendicular to up with the same handedness and unit length', () => {
    for (const a of [0, 0.7, Math.PI / 2, 3]) {
      const up = viewToWorld(0, -1, a), right = viewToWorld(1, 0, a);
      expect(Math.hypot(...right)).toBeCloseTo(1, 6);
      expect(up[0] * right[0] + up[1] * right[1]).toBeCloseTo(0, 6);
      expect(up[0] * right[1] - up[1] * right[0]).toBeCloseTo(1, 6); // same handedness as the unturned view
    }
  });
});

describe('toUnturned', () => {
  it('is the identity at quarter 0 and a full turn', () => {
    near(toUnturned(3, -2, 0), [3, -2]);
    near(toUnturned(3, -2, 4), [3, -2]);
  });
  it('puts the camera side back on +x/+y for every quarter', () => {
    // the camera of quarter q sits at the turned (1,1); un-turning that offset must give (1,1) again
    for (const q of [0, 1, 2, 3]) {
      const a = (q * Math.PI) / 2;
      const turned: [number, number] = [Math.cos(a) + Math.sin(a), Math.cos(a) - Math.sin(a)];
      near(toUnturned(turned[0], turned[1], q), [1, 1]);
    }
  });
});
