import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TILE, type MapData } from '@office3d/shared';
import { FurnitureLayer } from './Furniture';
import { TableProps } from './TableProps';
import { ProceduralLayer } from './Procedural';
import { gameSeatChairs } from './seat';
import { toUnturned } from './camera';
import { useStore } from '../store';

const WALL_H = 1.9;
const WALL_LOW = 0.12;

const floorColor = (x: number, y: number, door: boolean) =>
  door ? '#b98b5e' : (x + y) % 2 ? '#e4e9f0' : '#d6dde8';

/** Floor, walls and furniture of a map. When `focus` is given, walls hiding that point are cut down. */
export function MapView({ map, focus, showZones = true, lowWalls = false }: { map: MapData; focus?: { x: number; y: number }; showZones?: boolean; lowWalls?: boolean }) {
  const floorRef = useRef<THREE.InstancedMesh>(null);
  const wallRef = useRef<THREE.InstancedMesh>(null);
  const zoneRef = useRef<THREE.InstancedMesh>(null);

  const furniture = useMemo(() => [...map.furniture, ...gameSeatChairs(map)], [map]);

  const { floors, walls, zoneTiles } = useMemo(() => {
    const floors: { x: number; y: number; door: boolean }[] = [];
    const walls: { x: number; y: number }[] = [];
    map.tiles.forEach((t, i) => {
      const x = i % map.width, y = Math.floor(i / map.width);
      if (t === TILE.FLOOR || t === TILE.DOOR) floors.push({ x, y, door: t === TILE.DOOR });
      else if (t === TILE.WALL) walls.push({ x, y });
    });
    const zoneTiles: { x: number; y: number; color: string }[] = [];
    for (const z of map.zones) for (const i of z.tiles) zoneTiles.push({ x: i % map.width, y: Math.floor(i / map.width), color: z.color });
    return { floors, walls, zoneTiles };
  }, [map.tiles, map.width, map.zones]);

  useLayoutEffect(() => {
    const im = floorRef.current!;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    floors.forEach((f, i) => {
      im.setMatrixAt(i, m.makeTranslation(f.x + 0.5, -0.05, f.y + 0.5));
      im.setColorAt(i, c.set(floorColor(f.x, f.y, f.door)));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [floors]);

  useLayoutEffect(() => {
    const im = zoneRef.current;
    if (!im) return;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    zoneTiles.forEach((z, i) => {
      im.setMatrixAt(i, m.makeTranslation(z.x + 0.5, 0.012, z.y + 0.5));
      im.setColorAt(i, c.set(z.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [zoneTiles]);

  const quarter = useStore((s) => ((s.viewRot % 4) + 4) % 4);
  const lastKey = useRef('');
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const setWalls = (fx: number, fy: number, useFocus: boolean) => {
    const im = wallRef.current;
    if (!im) return;
    walls.forEach((w, i) => {
      let h = lowWalls ? 0.5 : WALL_H;
      if (useFocus) {
        // Unturned, the camera sits towards +x/+y: walls in front of the player (and roughly on the view line) get cut down.
        const [dx, dy] = toUnturned(w.x + 0.5 - fx, w.y + 0.5 - fy, quarter);
        if (dx > -0.6 && dy > -0.6 && dx + dy < 9 && Math.abs(dx - dy) < 3.2) h = WALL_LOW;
      }
      m4.makeScale(1, h, 1).setPosition(w.x + 0.5, h / 2, w.y + 0.5);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => { lastKey.current = ''; setWalls(focus?.x ?? 0, focus?.y ?? 0, !!focus); }, [walls, lowWalls, quarter]);
  useFrame(() => {
    if (!focus) return;
    const key = `${Math.floor(focus.x)},${Math.floor(focus.y)},${walls.length},${quarter}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    setWalls(focus.x, focus.y, true);
  });

  return (
    <>
      <instancedMesh key={`f${floors.length}`} ref={floorRef} args={[undefined, undefined, floors.length]} frustumCulled={false}>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      {showZones && zoneTiles.length > 0 && (
        <instancedMesh key={`z${zoneTiles.length}`} ref={zoneRef} args={[undefined, undefined, zoneTiles.length]} frustumCulled={false}>
          <boxGeometry args={[1, 0.02, 1]} />
          <meshStandardMaterial transparent opacity={0.28} depthWrite={false} />
        </instancedMesh>
      )}
      <instancedMesh key={`w${walls.length}`} ref={wallRef} args={[undefined, undefined, walls.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#f4efe6" />
      </instancedMesh>
      <FurnitureLayer furniture={furniture} />
      <TableProps furniture={map.furniture} />
      <ProceduralLayer furniture={map.furniture} />
    </>
  );
}
