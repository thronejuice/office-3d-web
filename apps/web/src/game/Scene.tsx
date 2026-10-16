import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MOVE, canStand, findPath, footprint, nearestWalkable, pathToNeighbour, type MapData } from '@office3d/shared';
import { useStore, ZOOM_MULT } from '../store';
import { live } from './live';
import { inputVector } from './input';
import { sendMove } from './net';
import { MapView } from './MapView';
import { Avatar } from './Avatar';
import { cam } from './camera';
import { deskEditClick } from './deskEdit';

const CAM_OFFSET = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(40);
const offset = new THREE.Vector3();

export function IsoRig({ follow, zoomFor }: { follow: { x: number; y: number }; zoomFor?: (w: number, h: number) => number }) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3(follow.x, 0, follow.y));
  const angle = useRef((useStore.getState().viewRot * Math.PI) / 2);
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 8);
    const want = (useStore.getState().viewRot * Math.PI) / 2;
    angle.current += (want - angle.current) * (1 - Math.exp(-dt * 10));
    if (Math.abs(want - angle.current) < 1e-3) angle.current = want;
    cam.angle = angle.current;
    const c = Math.cos(angle.current), s = Math.sin(angle.current);
    offset.set(CAM_OFFSET.x * c + CAM_OFFSET.z * s, CAM_OFFSET.y, -CAM_OFFSET.x * s + CAM_OFFSET.z * c);
    target.current.x += (follow.x - target.current.x) * k;
    target.current.z += (follow.y - target.current.z) * k;
    camera.position.copy(target.current).add(offset);
    camera.lookAt(target.current);
    camera.updateMatrixWorld();
    cam.camera = camera; cam.w = size.width; cam.h = size.height;
    const z = (zoomFor ? zoomFor(size.width, size.height) : Math.max(30, Math.min(72, Math.min(size.width, size.height) / 11))) * ZOOM_MULT[useStore.getState().zoomStep + 1];
    if (camera.zoom !== z) { camera.zoom = z; camera.updateProjectionMatrix(); }
  });
  return null;
}

function LocalPlayer() {
  const acc = useRef(0);
  const lastSent = useRef({ x: -1, y: -1, dir: -1 });
  const followT = useRef(0);

  useFrame((_, rawDt) => {
    const map = live.map;
    if (!map) return;
    const dt = Math.min(rawDt, 0.25); // keeps walking speed right on slow frame rates
    const s = live.self;
    if (live.seated) { live.cancelWalk(); return; } // sitting at a game table
    const iv = inputVector();
    let vx = 0, vy = 0;
    if (iv) {
      if (live.path.length || live.followId) live.cancelWalk();
      [vx, vy] = iv;
    } else if (live.followId) {
      const o = live.others.get(live.followId);
      if (!o) live.cancelWalk();
      else {
        followT.current -= dt;
        if (Math.hypot(o.x - s.x, o.y - s.y) <= 1.7) live.cancelWalk();
        else if (followT.current <= 0 || !live.path.length) {
          followT.current = 0.4;
          const p = pathToNeighbour(live.grid, map.width, map.height, { x: Math.floor(s.x), y: Math.floor(s.y) }, { x: Math.floor(o.x), y: Math.floor(o.y) });
          live.path = p ? p.slice(1) : [];
          if (!p) live.cancelWalk();
        }
      }
    }
    if (!iv && live.path.length) {
      const n = live.path[0];
      const tx = n.x + 0.5, ty = n.y + 0.5;
      const d = Math.hypot(tx - s.x, ty - s.y);
      if (d < 0.1) live.path.shift();
      else { vx = (tx - s.x) / d; vy = (ty - s.y) / d; }
    }
    if (vx || vy) {
      const step = MOVE.speed * dt;
      const nx = s.x + vx * step, ny = s.y + vy * step;
      if (canStand(live.grid, map, nx, s.y, MOVE.radius)) s.x = nx;
      if (canStand(live.grid, map, s.x, ny, MOVE.radius)) s.y = ny;
      s.dir = Math.atan2(vx, vy);
    }
    s.zone = live.zoneAt(s.x, s.y);
    acc.current += dt;
    if (acc.current >= 1 / MOVE.sendHz) {
      acc.current = 0;
      const l = lastSent.current;
      if (Math.abs(l.x - s.x) > 0.001 || Math.abs(l.y - s.y) > 0.001 || Math.abs(l.dir - s.dir) > 0.01) {
        l.x = s.x; l.y = s.y; l.dir = s.dir;
        sendMove(s.x, s.y, s.dir);
      }
    }
  });
  return null;
}

/** Plan a route from where we stand to the clicked world point. */
export function walkToPoint(x: number, y: number, map: MapData) {
  let tx = Math.floor(x), ty = Math.floor(y);
  if (live.grid[ty * map.width + tx] !== 1) {
    const n = nearestWalkable(live.grid, map, x, y);
    if (!n) return;
    tx = Math.floor(n.x); ty = Math.floor(n.y);
  }
  const p = findPath(live.grid, map.width, map.height, { x: Math.floor(live.self.x), y: Math.floor(live.self.y) }, { x: tx, y: ty });
  if (!p) return;
  live.followId = null;
  live.path = p.slice(1);
}

function DeskAreaMarks({ width }: { width: number }) {
  const area = useStore((s) => s.deskArea);
  if (!area) return null;
  return (
    <>
      {area.map((i) => (
        <mesh key={i} position={[(i % width) + 0.5, 0.03, Math.floor(i / width) + 0.5]}>
          <boxGeometry args={[0.96, 0.04, 0.96]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

function World({ map }: { map: MapData }) {
  const people = useStore((s) => s.people);
  const ids = useMemo(() => Object.keys(people), [people]);
  const selfId = useStore((s) => s.selfId);
  const focus = useMemo(() => live.self, []);
  const onFloor = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    useStore.getState().set({ selectedId: null });
    if (deskEditClick.handler) return deskEditClick.handler(Math.floor(e.point.x), Math.floor(e.point.z));
    const table = map.furniture.find((f) => f.game && footprint(f).some((c) => c.x === Math.floor(e.point.x) && c.y === Math.floor(e.point.z)));
    if (table) return void useStore.getState().set({ openTable: table.id });
    walkToPoint(e.point.x, e.point.z, map);
  };
  return (
    <>
      <ambientLight intensity={1.15} />
      <directionalLight position={[8, 20, 6]} intensity={1.6} />
      <hemisphereLight args={['#ffffff', '#9aa6b5', 0.5]} />
      <MapView map={map} focus={focus} />
      <mesh rotation-x={-Math.PI / 2} position={[map.width / 2, 0.001, map.height / 2]} onPointerDown={onFloor}>
        <planeGeometry args={[map.width, map.height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {ids.map((id) => <Avatar key={id} id={id} isSelf={id === selfId} />)}
      <DeskAreaMarks width={map.width} />
      <LocalPlayer />
      <IsoRig follow={focus} />
    </>
  );
}

export function OfficeCanvas() {
  const map = useStore((s) => s.map);
  const mobile = useMemo(() => matchMedia('(pointer: coarse)').matches, []);
  useEffect(() => {
    // keep WebGL context alive/clean on unmount
    return () => void 0;
  }, []);
  if (!map) return null;
  return (
    <Canvas orthographic dpr={[1, mobile ? 1.5 : 2]} camera={{ position: [40, 40, 40], zoom: 50, near: 0.1, far: 200 }} gl={{ antialias: !mobile, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#cfd8e6']} />
      <Suspense fallback={null}>
        <World map={map} />
      </Suspense>
    </Canvas>
  );
}
