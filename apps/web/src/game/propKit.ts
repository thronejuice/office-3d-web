import * as THREE from 'three';

/** Small helpers for building furniture and props out of primitives. Materials are cached and shared; geometries belong to the caller. */
const mats = new Map<string, THREE.MeshStandardMaterial>();
export const mat = (c: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const k = c + JSON.stringify(opts);
  let m = mats.get(k);
  if (!m) mats.set(k, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...opts })));
  return m;
};

export const mesh = (g: THREE.BufferGeometry, c: string, x: number, y: number, z: number, ry = 0, opts?: Partial<THREE.MeshStandardMaterialParameters>) => {
  const m = new THREE.Mesh(g, mat(c, opts));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return m;
};
export const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, ry = 0) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, ry);
export const cyl = (r: number, h: number, c: string, x: number, y: number, z: number, seg = 14) => mesh(new THREE.CylinderGeometry(r, r, h, seg), c, x, y + h / 2, z);


/** Seeded random numbers (from a string) so every client draws the same thing and it keeps its look when others change. */
export function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
