import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { MapData } from '@office3d/shared';
import { MapView } from '../game/MapView';

/** Frames the map once around the spawn point; the canvas only renders on demand, so it costs nothing at rest. */
function Frame({ map }: { map: MapData }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(map.spawn.x + 40, 40, map.spawn.y + 40);
    camera.lookAt(map.spawn.x, 0, map.spawn.y);
    camera.zoom = Math.max(16, Math.min(32, Math.min(size.width, size.height) / 24));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, map.spawn.x, map.spawn.y, invalidate]);
  return null;
}

/** The office seen from the entrance, without people: the scene the lobby panel floats in front of. */
export default function LobbyBackdrop({ map }: { map: MapData }) {
  return (
    <Canvas className="lobby-scene" aria-hidden orthographic frameloop="demand" dpr={[1, 1.5]} camera={{ near: -100, far: 300 }} gl={{ antialias: false }}>
      <color attach="background" args={['#cfd8e6']} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[8, 20, 6]} intensity={1.6} />
      <hemisphereLight args={['#ffffff', '#9aa6b5', 0.5]} />
      <Suspense fallback={null}>
        <MapView map={map} showZones={false} />
      </Suspense>
      <Frame map={map} />
    </Canvas>
  );
}
