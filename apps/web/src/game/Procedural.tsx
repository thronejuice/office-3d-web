import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CATALOG_BY_ID, type Furniture } from '@office3d/shared';
import { box, cyl, mat, mesh, rng } from './propKit';
import { POSTER_H, POSTER_W, VIEW_SIZE, paintPoster, paintView } from './wallArt';
import { TV_H, TV_SCENES, TV_W, nextScene, sceneSeconds } from './tvScenes';

/**
 * Furniture with no GLB: built from primitives (catalog items with `procedural`). Each builder is centred on its
 * footprint at rotation 0, stands on y = 0 and faces +z, like the GLB furniture.
 */
const lit = (c: string) => ({ emissive: c, emissiveIntensity: 0.9 });

function jukebox() {
  const g = new THREE.Group();
  g.add(box(0.62, 0.1, 0.36, '#3b2314', 0, 0, 0));
  g.add(box(0.58, 0.85, 0.32, '#7a2e1e', 0, 0.1, 0));
  const arch = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.32, 16), '#7a2e1e', 0, 0.95, 0);
  arch.rotation.x = Math.PI / 2;
  g.add(arch);
  g.add(mesh(new THREE.TorusGeometry(0.22, 0.016, 6, 20, Math.PI), '#38d6ff', 0, 0.78, 0.17, 0, lit('#38d6ff'))); // neon arch
  const win = box(0.4, 0.3, 0.02, '#ffcf6b', 0, 0.56, 0.165);
  (win.material as THREE.MeshStandardMaterial).emissive.set('#ffb347');
  g.add(win);
  const rec = cyl(0.12, 0.01, '#15151a', 0, 0.71, 0.18, 24); // the record behind the glass
  rec.rotation.x = Math.PI / 2;
  rec.position.set(0, 0.71, 0.185);
  g.add(rec);
  const label = cyl(0.04, 0.012, '#e63946', 0, 0.71, 0.19, 16);
  label.rotation.x = Math.PI / 2;
  label.position.set(0, 0.71, 0.19);
  g.add(label);
  g.add(box(0.4, 0.22, 0.02, '#2b2b30', 0, 0.16, 0.165)); // speaker grille
  [['#e63946', 0.3], ['#f4c430', 0.26], ['#2fae5e', 0.22]].forEach(([c, y]) => g.add(box(0.4, 0.015, 0.012, c as string, 0, y as number, 0.178, 0)));
  return g;
}

function piano() {
  const g = new THREE.Group();
  g.add(box(1.7, 0.95, 0.4, '#2d2018', 0, 0, -0.25));
  g.add(box(1.74, 0.04, 0.44, '#241810', 0, 0.95, -0.25));
  g.add(box(1.6, 0.05, 0.16, '#2d2018', 0, 0.68, -0.02)); // key slip
  g.add(box(1.5, 0.02, 0.13, '#f5f1e8', 0, 0.73, -0.02)); // white keys
  const black = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.025, 0.07), mat('#111114'), 25);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 35 && n < 25; i++) if (![2, 6].includes(i % 7)) black.setMatrixAt(n++, m.makeTranslation(-0.75 + (i + 1) * (1.5 / 36), 0.755, -0.05));
  black.count = n;
  g.add(black);
  g.add(box(0.5, 0.28, 0.01, '#f9f9f9', 0, 0.8, -0.04)); // sheet music
  g.add(cyl(0.15, 0.04, '#3a2a20', 0, 0.36, 0.33, 16)); // stool
  for (const [x, z] of [[-0.08, 0.26], [0.08, 0.26], [-0.08, 0.4], [0.08, 0.4]]) g.add(cyl(0.012, 0.36, '#3a2a20', x, 0, z, 6));
  return g;
}

function guitar() {
  const g = new THREE.Group();
  g.add(box(0.5, 0.02, 0.03, '#2b2b30', 0, 0, 0), box(0.03, 0.02, 0.5, '#2b2b30', 0, 0, 0)); // stand feet
  g.add(box(0.03, 0.45, 0.03, '#2b2b30', 0, 0.02, 0));
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.28, 0.06);
  tilt.rotation.x = -0.12;
  const lower = mesh(new THREE.SphereGeometry(0.17, 14, 10), '#c8864b', 0, 0.12, 0);
  lower.scale.set(1, 1, 0.28);
  const upper = mesh(new THREE.SphereGeometry(0.125, 14, 10), '#c8864b', 0, 0.36, 0);
  upper.scale.set(1, 1, 0.28);
  const hole = cyl(0.045, 0.012, '#1d1209', 0, 0.2, 0.02, 14);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, 0.2, 0.045);
  tilt.add(lower, upper, hole, box(0.05, 0.62, 0.03, '#5a3b22', 0, 0.45, 0), box(0.07, 0.12, 0.025, '#3b2514', 0, 1.06, 0));
  g.add(tilt);
  return g;
}

function drums() {
  const g = new THREE.Group();
  const horiz = (r: number, h: number, c: string, x: number, y: number, z: number) => {
    const m = cyl(r, h, c, 0, 0, 0, 20);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  };
  g.add(horiz(0.3, 0.4, '#c0392b', 0, 0.3, -0.25)); // kick
  g.add(horiz(0.285, 0.01, '#f4f4f4', 0, 0.3, -0.04));
  g.add(cyl(0.01, 0.55, '#8a8f98', -0.45, 0, 0.1, 6), cyl(0.17, 0.14, '#e8e8ea', -0.45, 0.52, 0.1, 18), cyl(0.15, 0.01, '#fafafa', -0.45, 0.66, 0.1, 18)); // snare
  g.add(cyl(0.13, 0.12, '#c0392b', -0.16, 0.72, -0.35, 16), cyl(0.13, 0.12, '#c0392b', 0.16, 0.72, -0.35, 16)); // toms
  g.add(cyl(0.2, 0.35, '#c0392b', 0.55, 0, 0.05, 18)); // floor tom
  g.add(cyl(0.008, 1.0, '#8a8f98', -0.75, 0, 0.2, 6), cyl(0.17, 0.008, '#e6b422', -0.75, 1.0, 0.2, 20), cyl(0.17, 0.008, '#e6b422', -0.75, 1.02, 0.2, 20)); // hi-hat
  g.add(cyl(0.008, 1.2, '#8a8f98', 0.7, 0, -0.4, 6));
  const crash = cyl(0.22, 0.008, '#e6b422', 0.7, 1.2, -0.4, 22);
  crash.rotation.z = 0.15;
  g.add(crash);
  g.add(cyl(0.15, 0.04, '#2b2b30', 0, 0.4, 0.75, 16));
  g.add(cyl(0.015, 0.4, '#8a8f98', 0, 0, 0.75, 6));
  return g;
}

/** The wide TV on a media console; its screen is the returned mesh, which the component paints. */
function bigTv() {
  const g = new THREE.Group();
  g.add(box(2.8, 0.45, 0.4, '#2b2b30', 0, 0, 0));
  g.add(box(2.84, 0.03, 0.42, '#6b4a2f', 0, 0.45, 0));
  g.add(box(0.3, 0.1, 0.18, '#15151a', 0, 0.48, 0));
  g.add(box(2.5, 1.4, 0.06, '#111114', 0, 0.58, 0)); // bezel and body
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.38, 1.34), new THREE.MeshBasicMaterial({ color: '#000', toneMapped: false }));
  screen.position.set(0, 1.28, 0.032);
  g.add(screen);
  g.add(box(0.5, 0.025, 0.04, '#e63946', 0.9, 0.5, 0.2)); // console decoration
  return { g, screen };
}

/** A framed view or a poster hung on the back edge of its tile (the wall is at z = -0.5), centred 1.3 high; `picture` is painted by `Hanging`. */
function hanging(kind: 'painting' | 'poster') {
  const g = new THREE.Group();
  const [w, h] = kind === 'painting' ? [1.6, 0.9] : [0.6, 0.844];
  if (kind === 'painting') g.add(box(w + 0.12, h + 0.12, 0.05, '#5a3d2b', 0, 1.3 - (h + 0.12) / 2, -0.475));
  else g.add(box(w + 0.04, h + 0.04, 0.015, '#f4f4f4', 0, 1.3 - (h + 0.04) / 2, -0.4925));
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ roughness: 0.9, color: '#ddd' }));
  picture.position.set(0, 1.3, kind === 'painting' ? -0.448 : -0.483);
  g.add(picture);
  return { g, picture };
}

export const PROCEDURAL: Record<string, () => THREE.Group> = {
  jukebox, piano, guitar, drums, bigTv: () => bigTv().g, painting: () => hanging('painting').g, poster: () => hanging('poster').g,
};

const dispose = (o: THREE.Object3D) => o.traverse((c) => { (c as THREE.Mesh).geometry?.dispose(); });

/** Shows a random picture from `tvScenes`, fading through black to the next one every 8 to 14 seconds. */
function BigTv() {
  const { g, screen } = useMemo(bigTv, []);
  const paint = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = TV_W;
    canvas.height = TV_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { canvas, tex };
  }, []);
  const st = useRef({ scene: -1, left: 0, phase: 'out' as 'out' | 'show' | 'in', k: 0 });
  useEffect(() => {
    const m = screen.material as THREE.MeshBasicMaterial;
    m.map = paint.tex;
    m.needsUpdate = true;
    return () => { paint.tex.dispose(); m.dispose(); dispose(g); };
  }, [screen, paint, g]);
  useFrame((_, dt) => {
    const s = st.current, m = screen.material as THREE.MeshBasicMaterial;
    if (s.phase === 'show') {
      s.left -= dt;
      if (s.left <= 0) s.phase = 'out';
    } else if (s.phase === 'out') {
      s.k = Math.max(0, s.k - dt / 0.4);
      if (s.k === 0) {
        s.scene = nextScene(s.scene);
        TV_SCENES[s.scene](paint.canvas.getContext('2d')!, Math.random);
        paint.tex.needsUpdate = true;
        s.phase = 'in';
      }
    } else {
      s.k = Math.min(1, s.k + dt / 0.4);
      if (s.k === 1) { s.phase = 'show'; s.left = sceneSeconds(); }
    }
    m.color.setScalar(s.k);
  });
  return <primitive object={g} />;
}

/** A view or poster; which one it shows comes from the furniture id, so everybody sees the same and it never changes by itself. */
function Hanging({ f }: { f: Furniture }) {
  const kind = f.type as 'painting' | 'poster';
  const { g, picture } = useMemo(() => hanging(kind), [kind]);
  useEffect(() => {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = kind === 'painting' ? [VIEW_SIZE.w, VIEW_SIZE.h] : [POSTER_W, POSTER_H];
    (kind === 'painting' ? paintView : paintPoster)(canvas.getContext('2d')!, rng(f.id));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = picture.material as THREE.MeshStandardMaterial;
    m.map = tex;
    m.color.set('#fff');
    m.needsUpdate = true;
    return () => { tex.dispose(); m.dispose(); dispose(g); };
  }, [f.id, kind, g, picture]);
  return <primitive object={g} />;
}

function Item({ f }: { f: Furniture }) {
  const cat = CATALOG_BY_ID.get(f.type)!;
  const special = f.type === 'bigTv' || f.type === 'painting' || f.type === 'poster';
  const obj = useMemo(() => (special ? null : PROCEDURAL[f.type]()), [f.type, special]);
  useEffect(() => () => { if (obj) dispose(obj); }, [obj]);
  const [fw, fh] = f.rot % 2 ? [cat.h, cat.w] : [cat.w, cat.h];
  return (
    <group position={[f.x + fw / 2, 0, f.y + fh / 2]} rotation-y={(f.rot * Math.PI) / 2}>
      {obj ? <primitive object={obj} /> : f.type === 'bigTv' ? <BigTv /> : <Hanging f={f} />}
    </group>
  );
}

export function ProceduralLayer({ furniture }: { furniture: Furniture[] }) {
  return <>{furniture.filter((f) => CATALOG_BY_ID.get(f.type)?.procedural).map((f) => <Item key={f.id} f={f} />)}</>;
}
