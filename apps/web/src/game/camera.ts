import type * as THREE from 'three';
/** The live camera and viewport, shared with the DOM overlay that draws name tags. `angle` is the smoothed view rotation in radians. */
export const cam = { camera: null as THREE.Camera | null, w: 1, h: 1, angle: 0 };

/**
 * Screen-space direction (x right, y down) -> tile-space for a camera turned by `angle` around the player.
 * At angle 0 the camera looks along (-1,-1), so "up" is (-1,-1)/√2; every 90° turn rotates that view.
 */
export function viewToWorld(sx: number, sy: number, angle: number): [number, number] {
  const k = Math.SQRT1_2;
  const ox = (Math.cos(angle) + Math.sin(angle)) * k, oz = (Math.cos(angle) - Math.sin(angle)) * k; // unit vector from player to camera
  return [sx * oz + sy * ox, -sx * ox + sy * oz];
}

/** Maps a tile-space offset seen by a camera turned by `quarter` x 90° back to the unturned view (for the wall cut-away). */
export function toUnturned(dx: number, dy: number, quarter: number): [number, number] {
  const a = (quarter * Math.PI) / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return [dx * c - dy * s, dx * s + dy * c];
}
