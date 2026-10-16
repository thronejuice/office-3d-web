import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ACCESSORY_STYLES,
  BOTTOM_STYLES,
  DEFAULT_AVATAR,
  EYE_STYLES,
  HAIR_STYLES,
  MOUTH_STYLES,
  TOP_STYLES,
  type AvatarConfig,
} from '@office3d/shared';
import { AVATAR_HEIGHT, buildRig } from './Avatar';

describe('Avatar buildRig', () => {
  it('constructs complete rig with all required joints and groups', () => {
    const rig = buildRig(DEFAULT_AVATAR);
    expect(rig.root).toBeInstanceOf(THREE.Group);
    expect(rig.hips).toBeInstanceOf(THREE.Group);
    expect(rig.torso).toBeInstanceOf(THREE.Group);
    expect(rig.head).toBeInstanceOf(THREE.Group);
    expect(rig.eyes).toBeInstanceOf(THREE.Group);
    expect(rig.mouth).toBeInstanceOf(THREE.Group);
    expect(rig.arms.l).toBeInstanceOf(THREE.Group);
    expect(rig.arms.r).toBeInstanceOf(THREE.Group);
    expect(rig.legs.l).toBeInstanceOf(THREE.Group);
    expect(rig.legs.r).toBeInstanceOf(THREE.Group);
    expect(rig.thumb).toBeDefined();
  });

  it('verifies materials use smooth shading (flatShading: false)', () => {
    const rig = buildRig(DEFAULT_AVATAR);
    let checkedMaterials = 0;
    rig.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
        expect(m.flatShading).toBe(false);
        checkedMaterials++;
      }
    });
    expect(checkedMaterials).toBeGreaterThan(5);
  });

  it('builds without error for all hair styles', () => {
    for (const hairStyle of HAIR_STYLES) {
      const rig = buildRig({ ...DEFAULT_AVATAR, hairStyle });
      expect(rig.root.children.length).toBeGreaterThan(0);
    }
  });

  const meshes = (cfg: AvatarConfig) => { let n = 0; buildRig(cfg).root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
  const hairMeshes = (cfg: AvatarConfig) => meshes(cfg) - meshes({ ...cfg, hairStyle: 'bald' });

  it('hides the bun knot and tie when wearing cap or beanie', () => {
    const bun = { ...DEFAULT_AVATAR, hairStyle: 'bun' as const };
    expect(hairMeshes({ ...bun, accessory: 'none' })).toBe(3); // base + knot + tie
    expect(hairMeshes({ ...bun, accessory: 'cap' })).toBe(1);
    expect(hairMeshes({ ...bun, accessory: 'beanie' })).toBe(1);
  });

  it('builds without error for all eye styles', () => {
    for (const eyes of EYE_STYLES) {
      const rig = buildRig({ ...DEFAULT_AVATAR, eyes });
      expect(rig.eyes.children.length).toBeGreaterThan(0);
    }
  });

  it('builds without error for all mouth styles', () => {
    for (const mouth of MOUTH_STYLES) {
      const rig = buildRig({ ...DEFAULT_AVATAR, mouth });
      expect(rig.mouth.children.length).toBeGreaterThan(0);
    }
  });

  it('handles blush on and off', () => {
    expect(meshes({ ...DEFAULT_AVATAR, blush: true }) - meshes({ ...DEFAULT_AVATAR, blush: false })).toBe(2);
  });

  it('builds without error for all top styles', () => {
    for (const top of TOP_STYLES) {
      const rig = buildRig({ ...DEFAULT_AVATAR, top });
      expect(rig.torso.children.length).toBeGreaterThan(0);
    }
  });

  it('gives the suit a collar set and the tank top no sleeves', () => {
    const count = (top: AvatarConfig['top']) => { let n = 0; buildRig({ ...DEFAULT_AVATAR, top }).root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
    expect(count('suit')).toBe(count('longsleeve') + 4); // shirt, tie, 2 lapels
    expect(count('tank')).toBe(count('tee') - 2); // no sleeve cuffs
  });

  it('builds without error for all bottom styles', () => {
    for (const bottom of BOTTOM_STYLES) {
      const rig = buildRig({ ...DEFAULT_AVATAR, bottom });
      expect(rig.legs.l.children.length).toBeGreaterThan(0);
      expect(rig.legs.r.children.length).toBeGreaterThan(0);
    }
  });

  it('builds without error for all accessory styles', () => {
    for (const accessory of ACCESSORY_STYLES) {
      const rig = buildRig({ ...DEFAULT_AVATAR, accessory });
      expect(rig.root.children.length).toBeGreaterThan(0);
    }
  });

  it('is AVATAR_HEIGHT tall without accessories', () => {
    const rig = buildRig({ ...DEFAULT_AVATAR, hairStyle: 'bald', accessory: 'none' });
    expect(new THREE.Box3().setFromObject(rig.root).max.y).toBeCloseTo(AVATAR_HEIGHT, 2);
  });

  it('keeps the hand outside the head when waving or raising the hand', () => {
    const rig = buildRig(DEFAULT_AVATAR);
    const headPos = rig.head.getWorldPosition(new THREE.Vector3());
    for (const z of [Math.PI * 0.75, Math.PI * 0.9]) {
      rig.arms.r.rotation.set(0, 0, z);
      rig.root.updateMatrixWorld(true);
      const hand = rig.arms.r.children.find((c) => (c as THREE.Mesh).geometry?.type === 'SphereGeometry')!;
      expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(headPos)).toBeGreaterThan(0.315);
    }
  });

  it('brings the hands together when clapping', () => {
    const rig = buildRig(DEFAULT_AVATAR);
    rig.arms.l.rotation.set(-1.3, 0, 0.85);
    rig.arms.r.rotation.set(-1.3, 0, -0.85);
    rig.root.updateMatrixWorld(true);
    const hand = (a: THREE.Object3D) => a.children.find((c) => (c as THREE.Mesh).geometry?.type === 'SphereGeometry')!.getWorldPosition(new THREE.Vector3());
    expect(hand(rig.arms.l).distanceTo(hand(rig.arms.r))).toBeLessThan(0.15);
  });

  it('never lets hair or a hat cover any part of the eyes or the mouth', () => {
    const ray = new THREE.Raycaster();
    // number of probe rays (grid around the part) whose first hit is the part itself
    const visible = (cfg: AvatarConfig, part: 'eyes' | 'mouth') => {
      const rig = buildRig(cfg);
      rig.root.updateMatrixWorld(true);
      const o = rig[part].getWorldPosition(new THREE.Vector3());
      const x = part === 'eyes' ? -0.11 : 0;
      let n = 0;
      for (let dx = -0.05; dx <= 0.0501; dx += 0.01) for (let dy = -0.05; dy <= 0.0501; dy += 0.01) {
        ray.set(new THREE.Vector3(o.x + x + dx, o.y + dy, 3), new THREE.Vector3(0, 0, -1));
        for (let m = ray.intersectObject(rig.root, true)[0]?.object; m; m = m.parent as THREE.Object3D) if (m === rig[part]) { n++; break; }
      }
      return n;
    };
    const bare = { ...DEFAULT_AVATAR, hairStyle: 'bald' as const, accessory: 'none' as const };
    for (const eyes of EYE_STYLES) {
      const ref = visible({ ...bare, eyes }, 'eyes');
      expect(ref).toBeGreaterThan(0);
      for (const hairStyle of HAIR_STYLES) for (const accessory of ACCESSORY_STYLES) {
        if (accessory === 'glasses') continue; // sits in front of the eyes on purpose
        expect(visible({ ...DEFAULT_AVATAR, eyes, hairStyle, accessory }, 'eyes'), `eyes ${eyes}/${hairStyle}/${accessory}`).toBe(ref);
      }
    }
    for (const mouth of MOUTH_STYLES) {
      const ref = visible({ ...bare, mouth }, 'mouth');
      expect(ref).toBeGreaterThan(0);
      for (const hairStyle of HAIR_STYLES) for (const accessory of ACCESSORY_STYLES)
        expect(visible({ ...DEFAULT_AVATAR, mouth, hairStyle, accessory }, 'mouth'), `mouth ${mouth}/${hairStyle}/${accessory}`).toBe(ref);
    }
  });
});
