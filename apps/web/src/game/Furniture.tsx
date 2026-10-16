import { useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CATALOG, CATALOG_BY_ID, type Furniture as F } from '@office3d/shared';

const url = (model: string) => `/models/furniture/${model}`;
CATALOG.forEach((c) => c.procedural || useGLTF.preload(url(c.model)));

const MAX_H = 1.5;

/** One InstancedMesh per sub-mesh of the model, so N desks cost the same draw calls as one. */
function Group({ type, items }: { type: string; items: F[] }) {
  const cat = CATALOG_BY_ID.get(type)!;
  const { scene } = useGLTF(url(cat.model));
  const prep = useMemo(() => {
    scene.updateMatrixWorld(true);
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const m = o as THREE.Mesh;
      const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
      geo.computeBoundingBox();
      box.union(geo.boundingBox!);
      parts.push({ geo, mat: m.material as THREE.Material });
    });
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const s = Math.min((cat.w * 0.94) / size.x, (cat.h * 0.94) / size.z, MAX_H / size.y);
    return { parts, s, c, minY: box.min.y };
  }, [scene, cat]);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const m4 = new THREE.Matrix4(), t = new THREE.Matrix4(), r = new THREE.Matrix4(), sc = new THREE.Matrix4(), o = new THREE.Matrix4();
    o.makeTranslation(-prep.c.x, -prep.minY, -prep.c.z);
    sc.makeScale(prep.s, prep.s, prep.s);
    refs.current.forEach((im) => {
      if (!im) return;
      items.forEach((f, i) => {
        const [fw, fh] = f.rot % 2 ? [cat.h, cat.w] : [cat.w, cat.h];
        t.makeTranslation(f.x + fw / 2, 0, f.y + fh / 2);
        r.makeRotationY((f.rot * Math.PI) / 2);
        m4.copy(t).multiply(r).multiply(sc).multiply(o);
        im.setMatrixAt(i, m4);
      });
      im.count = items.length;
      im.instanceMatrix.needsUpdate = true;
    });
  }, [items, prep, cat]);

  return (
    <>
      {prep.parts.map((p, i) => (
        <instancedMesh key={`${type}-${i}-${items.length}`} ref={(el) => void (refs.current[i] = el)} args={[p.geo, p.mat, items.length]} frustumCulled={false} />
      ))}
    </>
  );
}

export function FurnitureLayer({ furniture }: { furniture: F[] }) {
  const byType = useMemo(() => {
    const m = new Map<string, F[]>();
    for (const f of furniture) if (CATALOG_BY_ID.has(f.type) && !CATALOG_BY_ID.get(f.type)!.procedural) m.set(f.type, [...(m.get(f.type) ?? []), f]);
    return [...m.entries()];
  }, [furniture]);
  return <>{byType.map(([type, items]) => <Group key={type} type={type} items={items} />)}</>;
}
