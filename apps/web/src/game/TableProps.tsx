import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CATALOG_BY_ID, GAME_TABLE, type Furniture } from '@office3d/shared';
import { box, cyl, mat, mesh, rng } from './propKit';

/** Surface height per furniture type that carries props (game tables, desks, the TV cabinet), measured from the GLBs after Furniture.tsx scales them. */
const TOP: Record<string, number> = { desk: 0.92, cabinetTelevision: 0.73, [GAME_TABLE.poker]: 0.69, [GAME_TABLE.chess]: 0.68, [GAME_TABLE.uno]: 0.86, [GAME_TABLE.pokdeng]: 0.86, [GAME_TABLE.bingo]: 0.86 };

const CARD = { w: 0.07, h: 0.003, d: 0.1 };
const card = (c: string, x: number, y: number, z: number, ry = 0) => box(CARD.w, CARD.h, CARD.d, c, x, y, z, ry);
const chips = (colors: string[], x: number, z: number) => {
  const g = new THREE.Group();
  colors.forEach((c, i) => g.add(cyl(0.04, 0.012, c, x, i * 0.012, z, 16)));
  return g;
};

function poker() {
  const g = new THREE.Group();
  g.add(box(1.5, 0.006, 0.7, '#1f7a4a', 0, 0, 0)); // green felt
  [-0.25, -0.125, 0, 0.125, 0.25].forEach((x) => g.add(card('#fafafa', x, 0.006, 0, 0.06 * x)));
  g.add(chips(['#d63a3a', '#d63a3a', '#f4f4f4', '#d63a3a'], -0.55, 0.18));
  g.add(chips(['#2f6fe0', '#2f6fe0', '#2f6fe0'], -0.55, -0.15));
  g.add(chips(['#222222', '#222222', '#f4f4f4', '#222222', '#222222'], 0.55, 0.15));
  g.add(cyl(0.03, 0.008, '#e6b422', 0.42, 0.006, -0.22)); // dealer button
  return g;
}

function chess() {
  const g = new THREE.Group();
  const sq = 0.04;
  g.add(box(0.36, 0.012, 0.36, '#5a3d2b', 0, 0, 0));
  const light = new THREE.InstancedMesh(new THREE.BoxGeometry(sq, 0.004, sq), mat('#f0d9b5'), 32);
  const dark = new THREE.InstancedMesh(new THREE.BoxGeometry(sq, 0.004, sq), mat('#b58863'), 32);
  const m = new THREE.Matrix4();
  let li = 0, di = 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    m.makeTranslation((f - 3.5) * sq, 0.014, (r - 3.5) * sq);
    if ((r + f) % 2) dark.setMatrixAt(di++, m); else light.setMatrixAt(li++, m);
  }
  g.add(light, dark);
  // pieces: [rank row, colour, height]; pawns are short, the back rank taller
  const bodyGeo = new THREE.CylinderGeometry(0.011, 0.014, 1, 8);
  const headGeo = new THREE.SphereGeometry(0.012, 8, 6);
  for (const [colour, rows] of [['#f6f6f6', [[1, 0.026], [0, 0.04]]], ['#2a2a2e', [[6, 0.026], [7, 0.04]]]] as const) {
    const bodies = new THREE.InstancedMesh(bodyGeo, mat(colour), 16);
    const heads = new THREE.InstancedMesh(headGeo, mat(colour), 16);
    let i = 0;
    for (const [row, h] of rows) for (let f = 0; f < 8; f++, i++) {
      const x = (f - 3.5) * sq, z = (row - 3.5) * sq;
      m.compose(new THREE.Vector3(x, 0.016 + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m.makeTranslation(x, 0.016 + h + 0.006, z));
    }
    g.add(bodies, heads);
  }
  return g;
}

const UNO = ['#e63946', '#f4c430', '#2fae5e', '#2f6fe0'];
function uno() {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.22;
    g.add(card(UNO[i % 4], Math.sin(a) * 0.12 - 0.12, 0.003 * i, 0.1 - Math.cos(a) * 0.1, -a)); // fan of coloured cards
  }
  g.add(box(CARD.w, 0.03, CARD.d, '#1d1d1f', 0.22, 0, -0.05)); // draw pile
  g.add(box(0.05, 0.004, 0.07, '#e63946', 0.22, 0.03, -0.05));
  g.add(card('#f4c430', 0.08, 0, -0.18, 0.3)); // discard
  return g;
}

function pokdeng() {
  const g = new THREE.Group();
  g.add(cyl(0.52, 0.006, '#8e1b2b', 0, 0, 0, 40)); // red felt
  [-0.09, 0, 0.09].forEach((x, i) => g.add(card('#fafafa', x, 0.006 + 0.001 * i, 0.05, (i - 1) * 0.12)));
  g.add(chips(['#e6b422', '#e6b422', '#e6b422', '#e6b422', '#e6b422', '#e6b422'], -0.34, -0.18));
  g.add(chips(['#e6b422', '#f4f4f4', '#e6b422', '#e6b422'], 0.34, -0.18));
  g.add(chips(['#e6b422', '#e6b422', '#e6b422'], 0, -0.36));
  return g;
}

const BALLS = ['#e63946', '#f4c430', '#2fae5e', '#2f6fe0', '#9b59b6', '#ff8c42'];
function bingo() {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.04, '#2b2b30', 0, 0, 0));
  g.add(mesh(new THREE.SphereGeometry(0.14, 16, 12), '#9ecbff', 0, 0.2, 0, 0, { transparent: true, opacity: 0.28, depthWrite: false })); // cage
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4, r = 0.05 + (i % 3) * 0.025;
    g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), BALLS[i % BALLS.length], Math.cos(a) * r, 0.14 + (i % 4) * 0.03, Math.sin(a) * r));
  }
  for (const [x, z, ry] of [[-0.36, 0.2, 0.2], [0.36, 0.22, -0.25]] as const) {
    g.add(box(0.12, 0.003, 0.15, '#fafafa', x, 0, z, ry));
    g.add(box(0.12, 0.004, 0.03, '#d63a3a', x + Math.sin(ry) * 0.06, 0, z - Math.cos(ry) * 0.06, ry)); // B-I-N-G-O header
  }
  g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), '#2fae5e', 0.3, 0.03, -0.25)); // called ball
  return g;
}

const DOLL = ['#a9744f', '#f2a6c0', '#f4efe6', '#8fb8e8'];
/** Which optional things sit on the desk with this id. Every desk always has a laptop, a second monitor and a keyboard. */
export function deskExtras(id: string) {
  const r = rng(id);
  return { doll: r() < 0.4, cup: r() < 0.5, speaker: r() < 0.4, dollColor: DOLL[Math.floor(r() * DOLL.length)] };
}

// desk is 1.76 x 0.94 scaled; the chair is on the +z side, so everything faces +z
function desk(id: string) {
  const g = new THREE.Group();
  // laptop on the left: base, keyboard deck and a lid tilted back on its hinge
  g.add(box(0.34, 0.015, 0.24, '#c5c8cf', -0.35, 0, 0.12));
  g.add(box(0.28, 0.003, 0.12, '#3a3d44', -0.35, 0.015, 0.12));
  const lid = new THREE.Group();
  lid.position.set(-0.35, 0.015, 0);
  lid.rotation.x = -0.3;
  lid.add(box(0.34, 0.22, 0.012, '#c5c8cf', 0, 0, 0), box(0.31, 0.19, 0.004, '#3b82c4', 0, 0.015, 0.008));
  g.add(lid);
  // second monitor on a stand, with its own keyboard
  g.add(cyl(0.07, 0.012, '#2b2b30', 0.4, 0, -0.14, 16));
  g.add(box(0.04, 0.16, 0.03, '#2b2b30', 0.4, 0.012, -0.14));
  g.add(box(0.58, 0.34, 0.025, '#1d1d21', 0.4, 0.16, -0.14));
  g.add(box(0.54, 0.3, 0.006, '#3b82c4', 0.4, 0.18, -0.124));
  g.add(box(0.3, 0.01, 0.1, '#d9dce2', 0.4, 0, 0.22));
  const x = deskExtras(id);
  if (x.cup) {
    g.add(cyl(0.035, 0.09, '#f4f4f4', 0.8, 0, 0.2, 14), cyl(0.03, 0.004, '#5a3a22', 0.8, 0.088, 0.2, 14)); // mug and coffee
    const handle = mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 10), '#f4f4f4', 0.84, 0.045, 0.2);
    g.add(handle);
  }
  if (x.speaker) {
    g.add(box(0.07, 0.14, 0.07, '#2b2b30', 0.82, 0, -0.2));
    const cone = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 12), '#555a63', 0.82, 0.06, -0.162);
    cone.rotation.x = Math.PI / 2;
    g.add(cone);
  }
  if (x.doll) {
    const c = x.dollColor;
    const part = (r: number, px: number, py: number, pz: number) => g.add(mesh(new THREE.SphereGeometry(r, 10, 8), c, px, py, pz));
    part(0.06, -0.74, 0.06, -0.18); // body
    part(0.045, -0.74, 0.145, -0.18); // head
    part(0.018, -0.77, 0.185, -0.18); part(0.018, -0.71, 0.185, -0.18); // ears
    part(0.02, -0.805, 0.075, -0.17); part(0.02, -0.675, 0.075, -0.17); // arms
    g.add(mesh(new THREE.SphereGeometry(0.006, 6, 4), '#222222', -0.755, 0.15, -0.14), mesh(new THREE.SphereGeometry(0.006, 6, 4), '#222222', -0.725, 0.15, -0.14));
  }
  return g;
}

// flat screen on the TV cabinet (the cabinet model has no TV), screen towards +z
function tv() {
  const g = new THREE.Group();
  g.add(box(0.3, 0.02, 0.14, '#2b2b30', 0, 0, 0)); // stand
  g.add(box(0.1, 0.06, 0.04, '#2b2b30', 0, 0.02, 0));
  g.add(box(0.98, 0.56, 0.05, '#1d1d21', 0, 0.08, 0)); // bezel
  g.add(box(0.92, 0.5, 0.01, '#16324f', 0, 0.11, 0.026)); // screen
  return g;
}

const BUILD: Record<string, (id: string) => THREE.Group> = { desk, cabinetTelevision: tv, [GAME_TABLE.poker]: poker, [GAME_TABLE.chess]: chess, [GAME_TABLE.uno]: uno, [GAME_TABLE.pokdeng]: pokdeng, [GAME_TABLE.bingo]: bingo };

/** The props on a game table, desk or TV cabinet, centred on it with its surface at y = 0. Null for other furniture. */
export const buildTableProps = (type: string, id = '') => BUILD[type]?.(id) ?? null;

function Props({ f }: { f: Furniture }) {
  const cat = CATALOG_BY_ID.get(f.type)!;
  const obj = useMemo(() => buildTableProps(f.type, f.id)!, [f.type, f.id]);
  useEffect(() => () => obj.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); }), [obj]); // materials are shared, geometries are ours
  const [fw, fh] = f.rot % 2 ? [cat.h, cat.w] : [cat.w, cat.h];
  return (
    <group position={[f.x + fw / 2, TOP[f.type], f.y + fh / 2]} rotation-y={(f.rot * Math.PI) / 2}>
      <primitive object={obj} />
    </group>
  );
}

export function TableProps({ furniture }: { furniture: Furniture[] }) {
  return <>{furniture.filter((f) => BUILD[f.type]).map((f) => <Props key={f.id} f={f} />)}</>;
}
