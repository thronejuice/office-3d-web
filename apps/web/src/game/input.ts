import { cam, viewToWorld } from './camera';
/** Mutable input state read by the movement loop every frame. */
export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0 }, // screen-space, y down
  lastActivity: Date.now(),
};

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export function inputVector(): [number, number] | null {
  let sx = input.joy.x, sy = input.joy.y;
  for (const k of input.keys) {
    const d = MOVE_KEYS[k];
    if (d) { sx += d[0]; sy += d[1]; }
  }
  const len = Math.hypot(sx, sy);
  if (len < 0.15) return null;
  const [wx, wy] = viewToWorld(sx / Math.max(len, 1), sy / Math.max(len, 1), cam.angle);
  return [wx, wy];
}
