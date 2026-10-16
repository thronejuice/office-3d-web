import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { AvatarConfig } from '@office3d/shared';
import { seatedTable, useStore } from '../store';
import { hoverAvatar } from './hover';
import { live } from './live';
import { SEAT_HEIGHT, seatAt } from './seat';

export const AVATAR_HEIGHT = 1.45;
// tilts the hair cap so its front edge clears the eyes (y > 0.05) while the back hangs lower
const HAIR_TILT = -0.5;
// hips sit this far above the seat surface
const HIP_ABOVE_SEAT = 0.06;
const WALK_SWING_SPEED = 10;
const WALK_THRESHOLD = 0.6;

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Group;
  mouth: THREE.Group;
  arms: { l: THREE.Group; r: THREE.Group };
  legs: { l: THREE.Group; r: THREE.Group };
  thumb: THREE.Object3D;
}

const mat = (color: string) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    flatShading: false,
  });

/**
 * Builds a smooth, rounded Chibi avatar procedurally from Three.js geometries.
 * Proportion: large head (~45% of total height), short capsule body, short capsule limbs,
 * round hands, dark flat-round shoes. Total height is AVATAR_HEIGHT (1.45).
 */
export function buildRig(cfg: AvatarConfig): Rig {
  const root = new THREE.Group();

  const skin = mat(cfg.skin);
  const hair = mat(cfg.hairColor);
  const top = mat(cfg.topColor);
  const bottom = mat(cfg.bottomColor);
  const dark = mat('#23252a');
  const white = mat('#ffffff');
  const acc = mat(cfg.accessoryColor);
  const blushMat = mat('#ff7a90');

  // Hips group: sits at y = 0.44 when standing, lowers when sitting
  const hips = new THREE.Group();
  hips.position.y = 0.44;
  root.add(hips);

  // Pelvis mesh
  const pelvisGeo = new THREE.SphereGeometry(0.18, 12, 8);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, bottom);
  pelvisMesh.scale.set(1.05, 0.7, 0.95);
  pelvisMesh.position.set(0, 0.05, 0);
  hips.add(pelvisMesh);

  // Skirt (if bottom === 'skirt')
  if (cfg.bottom === 'skirt') {
    const skirtGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.20, 12, 1, true);
    const skirtMesh = new THREE.Mesh(skirtGeo, bottom);
    skirtMesh.position.set(0, 0.02, 0);
    hips.add(skirtMesh);
  }

  // Legs: pivot at left/right hip
  const legL = new THREE.Group();
  legL.position.set(-0.12, 0, 0);
  const legR = new THREE.Group();
  legR.position.set(0.12, 0, 0);
  hips.add(legL, legR);

  const legGeo = new THREE.CapsuleGeometry(0.065, 0.22, 4, 8);
  const shoeGeo = new THREE.SphereGeometry(0.08, 8, 6);
  const shortsCuffGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8);

  for (const leg of [legL, legR]) {
    const isPants = cfg.bottom === 'pants';
    const limbMat = isPants ? bottom : skin;
    const limbMesh = new THREE.Mesh(legGeo, limbMat);
    limbMesh.position.set(0, -0.18, 0);
    leg.add(limbMesh);

    if (cfg.bottom === 'shorts') {
      const cuff = new THREE.Mesh(shortsCuffGeo, bottom);
      cuff.position.set(0, -0.12, 0);
      leg.add(cuff);
    }

    // Flat rounded shoe
    const shoe = new THREE.Mesh(shoeGeo, dark);
    shoe.scale.set(1.0, 0.55, 1.35);
    shoe.position.set(0, -0.38, 0.03);
    leg.add(shoe);
  }

  // Torso: capsule extending upwards from hips
  const torso = new THREE.Group();
  torso.position.set(0, 0.20, 0);
  hips.add(torso);

  const torsoGeo = new THREE.CapsuleGeometry(0.18, 0.16, 4, 8);
  const torsoMesh = new THREE.Mesh(torsoGeo, top);
  torso.add(torsoMesh);

  // Clothing details on torso
  if (cfg.top === 'hoodie') {
    // Front pocket
    const pocketGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.09, 8, 1, false, 0, Math.PI);
    const pocket = new THREE.Mesh(pocketGeo, top);
    pocket.position.set(0, -0.04, 0.14);
    pocket.rotation.y = -Math.PI / 2;
    torso.add(pocket);

    // Hood resting on back
    const hoodGeo = new THREE.TorusGeometry(0.13, 0.045, 6, 12);
    const hood = new THREE.Mesh(hoodGeo, top);
    hood.position.set(0, 0.14, -0.11);
    hood.rotation.x = 0.55;
    torso.add(hood);
  } else if (cfg.top === 'suit') {
    // white shirt V, tie and two darker lapels on the jacket front
    const lapelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.topColor).multiplyScalar(0.7), roughness: 0.85 });
    const shirt = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), white);
    shirt.scale.set(0.8, 1.3, 0.2);
    shirt.position.set(0, 0.06, 0.165);
    const tie = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 4, 6), dark);
    tie.position.set(0, 0.02, 0.19);
    const lapelGeo = new THREE.CapsuleGeometry(0.025, 0.17, 4, 6);
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(lapelGeo, lapelMat);
      lapel.position.set(side * 0.085, 0.05, 0.17);
      lapel.rotation.z = side * 0.35;
      torso.add(lapel);
    }
    torso.add(shirt, tie);
  } else if (cfg.top === 'shirt') {
    // Shirt collar flaps
    const collarGeo = new THREE.TorusGeometry(0.12, 0.022, 4, 10, Math.PI * 0.9);
    const collar = new THREE.Mesh(collarGeo, top);
    collar.position.set(0, 0.16, 0.05);
    collar.rotation.x = -Math.PI / 2 + 0.3;
    collar.rotation.z = Math.PI * 0.05;
    torso.add(collar);
  }

  // Arms: pivot at shoulders
  const armL = new THREE.Group();
  armL.position.set(-0.24, 0.32, 0);
  const armR = new THREE.Group();
  armR.position.set(0.24, 0.32, 0);
  hips.add(armL, armR);

  const armGeo = new THREE.CapsuleGeometry(0.052, 0.16, 4, 8);
  const handGeo = new THREE.SphereGeometry(0.062, 8, 6);
  const teeSleeveGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.08, 8);

  let thumbMesh: THREE.Object3D = new THREE.Group();

  for (const [arm, side] of [[armL, -1], [armR, 1]] as const) {
    const isLongSleeve = cfg.top === 'longsleeve' || cfg.top === 'hoodie' || cfg.top === 'shirt' || cfg.top === 'suit';
    const armMat = isLongSleeve ? top : skin;
    const armMesh = new THREE.Mesh(armGeo, armMat);
    armMesh.position.set(0, -0.13, 0);
    arm.add(armMesh);

    if (cfg.top === 'tee') {
      const sleeve = new THREE.Mesh(teeSleeveGeo, top);
      sleeve.position.set(0, -0.07, 0);
      arm.add(sleeve);
    }

    // Round hand
    const hand = new THREE.Mesh(handGeo, skin);
    hand.position.set(0, -0.25, 0);
    arm.add(hand);

    // Thumbs-up prop on right arm
    if (side === 1) {
      const thumbGeo = new THREE.CapsuleGeometry(0.018, 0.045, 4, 6);
      const thumb = new THREE.Mesh(thumbGeo, skin);
      thumb.position.set(-0.04, -0.21, 0.02);
      thumb.rotation.z = 0.4;
      thumb.visible = false;
      arm.add(thumb);
      thumbMesh = thumb;
    }
  }

  // Head: sits on top of neck (at y = 0.695 in hips space)
  const head = new THREE.Group();
  head.position.set(0, 0.695, 0);
  hips.add(head);

  // Head sphere (radius 0.315 -> top of head = 0.44 + 0.695 + 0.315 = 1.45)
  const headGeo = new THREE.SphereGeometry(0.315, 16, 12);
  const headMesh = new THREE.Mesh(headGeo, skin);
  head.add(headMesh);

  // Eyes group
  const eyes = new THREE.Group();
  eyes.position.set(0, -0.01, 0.3);
  head.add(eyes);

  if (cfg.eyes === 'dot') {
    const dotGeo = new THREE.SphereGeometry(0.032, 8, 6);
    const eyeL = new THREE.Mesh(dotGeo, dark);
    eyeL.position.set(-0.11, 0, 0);
    const eyeR = new THREE.Mesh(dotGeo, dark);
    eyeR.position.set(0.11, 0, 0);
    eyes.add(eyeL, eyeR);
  } else if (cfg.eyes === 'round') {
    const roundEyeGeo = new THREE.SphereGeometry(0.052, 8, 6);
    const sparkleGeo = new THREE.SphereGeometry(0.016, 6, 6);

    const eyeL = new THREE.Mesh(roundEyeGeo, dark);
    eyeL.scale.set(1.0, 1.15, 0.35);
    eyeL.position.set(-0.11, 0, 0);

    const sparkL = new THREE.Mesh(sparkleGeo, white);
    sparkL.position.set(-0.095, 0.018, 0.02);

    const eyeR = new THREE.Mesh(roundEyeGeo, dark);
    eyeR.scale.set(1.0, 1.15, 0.35);
    eyeR.position.set(0.11, 0, 0);

    const sparkR = new THREE.Mesh(sparkleGeo, white);
    sparkR.position.set(0.125, 0.018, 0.02);

    eyes.add(eyeL, sparkL, eyeR, sparkR);
  } else if (cfg.eyes === 'happy') {
    // Arch lines (^^)
    const arcGeo = new THREE.TorusGeometry(0.036, 0.01, 4, 8, Math.PI);
    const eyeL = new THREE.Mesh(arcGeo, dark);
    eyeL.position.set(-0.11, 0, 0);
    eyeL.rotation.z = Math.PI;

    const eyeR = new THREE.Mesh(arcGeo, dark);
    eyeR.position.set(0.11, 0, 0);
    eyeR.rotation.z = Math.PI;

    eyes.add(eyeL, eyeR);
  } else if (cfg.eyes === 'sleepy') {
    // Horizontal bars (- -)
    const lineGeo = new THREE.CapsuleGeometry(0.01, 0.055, 4, 6);
    const eyeL = new THREE.Mesh(lineGeo, dark);
    eyeL.position.set(-0.11, 0, 0);
    eyeL.rotation.z = Math.PI / 2;

    const eyeR = new THREE.Mesh(lineGeo, dark);
    eyeR.position.set(0.11, 0, 0);
    eyeR.rotation.z = Math.PI / 2;

    eyes.add(eyeL, eyeR);
  }

  // Mouth group
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.11, 0.3);
  head.add(mouth);

  if (cfg.mouth === 'smile') {
    const smileGeo = new THREE.TorusGeometry(0.028, 0.008, 4, 8, Math.PI);
    const smileMesh = new THREE.Mesh(smileGeo, dark);
    mouth.add(smileMesh);
  } else if (cfg.mouth === 'open') {
    const openGeo = new THREE.SphereGeometry(0.032, 8, 8);
    const openMesh = new THREE.Mesh(openGeo, mat('#8a2525'));
    openMesh.scale.set(1.0, 1.25, 0.3);
    mouth.add(openMesh);
  } else if (cfg.mouth === 'cat') {
    const catArcGeo = new THREE.TorusGeometry(0.016, 0.006, 4, 8, Math.PI);
    const m1 = new THREE.Mesh(catArcGeo, dark);
    m1.position.set(-0.015, 0, 0);
    const m2 = new THREE.Mesh(catArcGeo, dark);
    m2.position.set(0.015, 0, 0);
    mouth.add(m1, m2);
  } else if (cfg.mouth === 'flat') {
    const flatGeo = new THREE.CapsuleGeometry(0.007, 0.035, 4, 6);
    const flatMesh = new THREE.Mesh(flatGeo, dark);
    flatMesh.rotation.z = Math.PI / 2;
    mouth.add(flatMesh);
  }

  // Blush
  if (cfg.blush) {
    const blushGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const bL = new THREE.Mesh(blushGeo, blushMat);
    bL.scale.set(1.3, 0.6, 0.2);
    bL.position.set(-0.18, -0.06, 0.26);

    const bR = new THREE.Mesh(blushGeo, blushMat);
    bR.scale.set(1.3, 0.6, 0.2);
    bR.position.set(0.18, -0.06, 0.26);

    head.add(bL, bR);
  }

  // Hair styles
  const hairGroup = new THREE.Group();
  head.add(hairGroup);

  const capGeo = new THREE.SphereGeometry(0.33, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const hasHat = cfg.accessory === 'cap' || cfg.accessory === 'beanie';

  if (cfg.hairStyle === 'short') {
    // Mushroom bowl cap + bangs
    const capMesh = new THREE.Mesh(capGeo, hair);
    capMesh.position.set(0, 0.02, 0);
    capMesh.rotation.x = HAIR_TILT;
    hairGroup.add(capMesh);

    const bangsGeo = new THREE.CapsuleGeometry(0.045, 0.22, 4, 8);
    const bangs = new THREE.Mesh(bangsGeo, hair);
    bangs.position.set(0, 0.16, 0.27);
    bangs.rotation.z = Math.PI / 2;
    hairGroup.add(bangs);
  } else if (cfg.hairStyle === 'bob') {
    const capMesh = new THREE.Mesh(capGeo, hair);
    capMesh.position.set(0, 0.02, 0);
    capMesh.rotation.x = HAIR_TILT;
    hairGroup.add(capMesh);

    // Side locks
    const sideGeo = new THREE.CapsuleGeometry(0.055, 0.22, 4, 8);
    const sL = new THREE.Mesh(sideGeo, hair);
    sL.position.set(-0.29, -0.08, 0.05);
    const sR = new THREE.Mesh(sideGeo, hair);
    sR.position.set(0.29, -0.08, 0.05);
    hairGroup.add(sL, sR);

    // Back hair
    const backGeo = new THREE.CapsuleGeometry(0.06, 0.24, 4, 8);
    const back = new THREE.Mesh(backGeo, hair);
    back.position.set(0, -0.10, -0.26);
    hairGroup.add(back);
  } else if (cfg.hairStyle === 'long') {
    const capMesh = new THREE.Mesh(capGeo, hair);
    capMesh.position.set(0, 0.02, 0);
    capMesh.rotation.x = HAIR_TILT;
    hairGroup.add(capMesh);

    // Long sides
    const sideGeo = new THREE.CapsuleGeometry(0.055, 0.36, 4, 8);
    const sL = new THREE.Mesh(sideGeo, hair);
    sL.position.set(-0.29, -0.16, 0.05);
    const sR = new THREE.Mesh(sideGeo, hair);
    sR.position.set(0.29, -0.16, 0.05);
    hairGroup.add(sL, sR);

    // Long back
    const backGeo = new THREE.CapsuleGeometry(0.07, 0.38, 4, 8);
    const back = new THREE.Mesh(backGeo, hair);
    back.position.set(0, -0.18, -0.27);
    hairGroup.add(back);
  } else if (cfg.hairStyle === 'ponytail') {
    const capMesh = new THREE.Mesh(capGeo, hair);
    capMesh.position.set(0, 0.02, 0);
    capMesh.rotation.x = HAIR_TILT;
    hairGroup.add(capMesh);

    // Ponytail at upper-back
    const tailGeo = new THREE.CapsuleGeometry(0.065, 0.28, 4, 8);
    const tail = new THREE.Mesh(tailGeo, hair);
    tail.position.set(0, 0.16, -0.32);
    tail.rotation.x = -0.6;
    hairGroup.add(tail);

    const tieGeo = new THREE.TorusGeometry(0.05, 0.015, 4, 8);
    const tie = new THREE.Mesh(tieGeo, dark);
    tie.position.set(0, 0.22, -0.26);
    tie.rotation.x = 0.5;
    hairGroup.add(tie);
  } else if (cfg.hairStyle === 'twintails') {
    const capMesh = new THREE.Mesh(capGeo, hair);
    capMesh.position.set(0, 0.02, 0);
    capMesh.rotation.x = HAIR_TILT;
    hairGroup.add(capMesh);

    // Twintails
    const tailGeo = new THREE.CapsuleGeometry(0.052, 0.26, 4, 8);
    const tL = new THREE.Mesh(tailGeo, hair);
    tL.position.set(-0.33, 0.08, -0.05);
    tL.rotation.z = -0.35;
    const tR = new THREE.Mesh(tailGeo, hair);
    tR.position.set(0.33, 0.08, -0.05);
    tR.rotation.z = 0.35;
    hairGroup.add(tL, tR);
  } else if (cfg.hairStyle === 'bun') {
    const capMesh = new THREE.Mesh(capGeo, hair);
    capMesh.position.set(0, 0.02, 0);
    capMesh.rotation.x = HAIR_TILT;
    hairGroup.add(capMesh);

    // Bun is hidden when wearing cap or beanie
    if (!hasHat) {
      const bunGeo = new THREE.SphereGeometry(0.12, 10, 8);
      const bunMesh = new THREE.Mesh(bunGeo, hair);
      bunMesh.position.set(0, 0.35, -0.08);

      const tieGeo = new THREE.TorusGeometry(0.08, 0.018, 4, 10);
      const tie = new THREE.Mesh(tieGeo, dark);
      tie.position.set(0, 0.31, -0.08);
      tie.rotation.x = Math.PI / 2;

      hairGroup.add(bunMesh, tie);
    }
  } else if (cfg.hairStyle === 'curly') {
    const capMesh = new THREE.Mesh(capGeo, hair);
    capMesh.position.set(0, 0.02, 0);
    capMesh.rotation.x = HAIR_TILT;
    hairGroup.add(capMesh);

    // Ring of cute fluffy curly bumps
    const curlGeo = new THREE.SphereGeometry(0.095, 8, 6);
    const curls = [
      [-0.18, 0.28, 0.12], [0, 0.32, 0.14], [0.18, 0.28, 0.12],
      [-0.28, 0.14, 0.10], [0.28, 0.14, 0.10],
      [-0.30, 0.02, -0.05], [0.30, 0.02, -0.05],
      [-0.22, 0.22, -0.18], [0, 0.30, -0.18], [0.22, 0.22, -0.18],
      [0, 0.12, -0.28],
    ];
    for (const [cx, cy, cz] of curls) {
      const curl = new THREE.Mesh(curlGeo, hair);
      curl.position.set(cx, cy, cz);
      hairGroup.add(curl);
    }
  } // bald has no hair meshes

  // Accessories
  if (cfg.accessory === 'glasses') {
    const ringGeo = new THREE.TorusGeometry(0.065, 0.012, 6, 16);
    const rL = new THREE.Mesh(ringGeo, acc);
    rL.position.set(-0.11, -0.01, 0.31);
    const rR = new THREE.Mesh(ringGeo, acc);
    rR.position.set(0.11, -0.01, 0.31);

    const bridgeGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6);
    const bridge = new THREE.Mesh(bridgeGeo, acc);
    bridge.position.set(0, -0.01, 0.31);
    bridge.rotation.z = Math.PI / 2;

    head.add(rL, rR, bridge);
  } else if (cfg.accessory === 'cap') {
    const capDomeGeo = new THREE.SphereGeometry(0.338, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const capDome = new THREE.Mesh(capDomeGeo, acc);
    capDome.position.set(0, 0.1, 0);

    const visorGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.03, 12, 1, false, 0, Math.PI);
    const visor = new THREE.Mesh(visorGeo, acc);
    visor.position.set(0, 0.16, 0.26);
    visor.rotation.x = 0.25;
    visor.rotation.y = -Math.PI / 2;

    head.add(capDome, visor);
  } else if (cfg.accessory === 'beanie') {
    const beanieGeo = new THREE.SphereGeometry(0.342, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const beanie = new THREE.Mesh(beanieGeo, acc);
    beanie.position.set(0, 0.1, 0);

    const rimGeo = new THREE.TorusGeometry(0.325, 0.038, 8, 16);
    const rim = new THREE.Mesh(rimGeo, acc);
    rim.position.set(0, 0.1, 0);
    rim.rotation.x = Math.PI / 2;

    const pomGeo = new THREE.SphereGeometry(0.065, 8, 6);
    const pom = new THREE.Mesh(pomGeo, acc);
    pom.position.set(0, 0.5, -0.05);

    head.add(beanie, rim, pom);
  } else if (cfg.accessory === 'headphones') {
    const bandGeo = new THREE.TorusGeometry(0.335, 0.018, 6, 16, Math.PI);
    const band = new THREE.Mesh(bandGeo, dark);
    band.position.set(0, 0.08, 0);
    band.rotation.y = -Math.PI / 2;
    band.rotation.x = -Math.PI / 2;

    const cupGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.055, 12);
    const cL = new THREE.Mesh(cupGeo, acc);
    cL.position.set(-0.32, 0.02, 0);
    cL.rotation.z = Math.PI / 2;

    const cR = new THREE.Mesh(cupGeo, acc);
    cR.position.set(0.32, 0.02, 0);
    cR.rotation.z = Math.PI / 2;

    head.add(band, cL, cR);
  } else if (cfg.accessory === 'bow') {
    const knotGeo = new THREE.SphereGeometry(0.035, 8, 6);
    const knot = new THREE.Mesh(knotGeo, acc);
    knot.position.set(0.20, 0.28, 0.15);

    const loopGeo = new THREE.SphereGeometry(0.065, 8, 6);
    const lL = new THREE.Mesh(loopGeo, acc);
    lL.scale.set(1.4, 0.7, 0.4);
    lL.position.set(0.14, 0.31, 0.15);
    lL.rotation.z = 0.5;

    const lR = new THREE.Mesh(loopGeo, acc);
    lR.scale.set(1.4, 0.7, 0.4);
    lR.position.set(0.26, 0.25, 0.15);
    lR.rotation.z = 0.5;

    head.add(knot, lL, lR);
  } else if (cfg.accessory === 'catEars') {
    const earGeo = new THREE.ConeGeometry(0.08, 0.15, 4);
    const innerGeo = new THREE.ConeGeometry(0.05, 0.10, 4);

    const eL = new THREE.Mesh(earGeo, acc);
    eL.position.set(-0.20, 0.33, 0.02);
    eL.rotation.z = 0.35;
    eL.rotation.y = Math.PI / 4;

    const inL = new THREE.Mesh(innerGeo, blushMat);
    inL.position.set(-0.19, 0.32, 0.04);
    inL.rotation.z = 0.35;
    inL.rotation.y = Math.PI / 4;

    const eR = new THREE.Mesh(earGeo, acc);
    eR.position.set(0.20, 0.33, 0.02);
    eR.rotation.z = -0.35;
    eR.rotation.y = -Math.PI / 4;

    const inR = new THREE.Mesh(innerGeo, blushMat);
    inR.position.set(0.19, 0.32, 0.04);
    inR.rotation.z = -0.35;
    inR.rotation.y = -Math.PI / 4;

    head.add(eL, inL, eR, inR);
  }

  return {
    root,
    hips,
    torso,
    head,
    eyes,
    mouth,
    arms: { l: armL, r: armR },
    legs: { l: legL, r: legR },
    thumb: thumbMesh,
  };
}

export function disposeRig(rig: Rig) {
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
}

export const Avatar = memo(function Avatar({ id, isSelf }: { id: string; isSelf: boolean }) {
  const person = useStore((s) => s.people[id]);
  const speaking = useStore((s) => !!s.speaking[id]);
  const selected = useStore((s) => s.selectedId === id);
  const isGameSeated = useStore((s) => !!seatedTable({ games: s.games, selfId: id }));

  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  const rig = useMemo(() => buildRig(person.avatar), [person.avatar]);
  useEffect(() => () => disposeRig(rig), [rig]);

  const lastPos = useRef(new THREE.Vector2());
  const walkPhase = useRef(0);
  const walkWeight = useRef(0);
  const stillTime = useRef(0);

  // Blinking timer refs
  const nextBlink = useRef(2 + Math.random() * 4);
  const blinkDuration = useRef(0);

  const raised = person.raised;
  const away = person.status === 'away';

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const L = isSelf ? live.self : live.others.get(id);
    if (!L) return;

    if (!isSelf) {
      const o = live.others.get(id)!;
      const k = 1 - Math.exp(-dt * 14);
      o.x += (o.tx - o.x) * k;
      o.y += (o.ty - o.y) * k;
      let dd = o.tdir - o.dir;
      dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      o.dir += dd * k;
    }

    g.position.set(L.x, 0, L.y);

    const speed = Math.hypot(L.x - lastPos.current.x, L.y - lastPos.current.y) / Math.max(dt, 1e-3);
    lastPos.current.set(L.x, L.y);

    // Check chair under avatar
    const map = useStore.getState().map;
    const seat = seatAt(map, L.x, L.y);
    if (seat !== null && speed <= WALK_THRESHOLD) {
      stillTime.current += dt;
    } else {
      stillTime.current = 0;
    }
    const isChairSeated = stillTime.current >= 0.3;
    const isSitting = isGameSeated || isChairSeated;

    // Heading direction: align with chair rotation when sitting on general chair, otherwise L.dir
    if (isChairSeated && seat !== null) {
      g.rotation.y = seat.angle;
    } else {
      g.rotation.y = L.dir;
    }

    const t = performance.now() / 1000;
    const wantWalk = speed > WALK_THRESHOLD && !isSitting;
    walkWeight.current += ((wantWalk ? 1 : 0) - walkWeight.current) * Math.min(1, dt / 0.15);

    const { l: armL, r: armR } = rig.arms;
    const { l: legL, r: legR } = rig.legs;

    if (isSitting) {
      // Sitting pose: hips lowered to seat height, legs bent forward 90 degrees
      // game seats have a chair drawn under them (gameSeatChairs), so they sit at chair height too
      rig.hips.position.y = (isChairSeated && seat ? seat.y : SEAT_HEIGHT.chair) + HIP_ABOVE_SEAT;
      legL.rotation.set(-Math.PI / 2, 0, 0);
      legR.rotation.set(-Math.PI / 2, 0, 0);
      armL.rotation.set(-0.15, 0, -0.05);
      armR.rotation.set(-0.15, 0, 0.05);
      rig.head.position.y = 0.695;
    } else {
      // Standing pose
      if (walkWeight.current > 0.01) {
        walkPhase.current += dt * WALK_SWING_SPEED;
        const legSwing = Math.sin(walkPhase.current) * 0.65 * walkWeight.current;
        legL.rotation.set(legSwing, 0, 0);
        legR.rotation.set(-legSwing, 0, 0);

        const armSwing = Math.sin(walkPhase.current) * 0.55 * walkWeight.current;
        armL.rotation.set(-armSwing, 0, -0.05);
        armR.rotation.set(armSwing, 0, 0.05);

        const bounce = Math.abs(Math.sin(walkPhase.current)) * 0.03 * walkWeight.current;
        rig.hips.position.y = 0.44 + bounce;
        rig.head.position.y = 0.695;
      } else {
        // Idle breathing
        const breath = Math.sin(t * 3) * 0.012;
        rig.hips.position.y = 0.44 + breath;
        rig.head.position.y = 0.695 + breath * 0.4;
        legL.rotation.set(0, 0, 0);
        legR.rotation.set(0, 0, 0);
        armL.rotation.set(0, 0, -0.05);
        armR.rotation.set(0, 0, 0.05);
      }
    }

    // Procedural arm poses for emotes
    const e = useStore.getState().emotes[id];
    const active = e && e.until > Date.now() ? e.emote : null;
    rig.thumb.visible = active === 'thumbsup';
    // +z on armR swings it outwards/up (the arms sit at x = ±0.24), -z on armL
    if (active === 'wave') {
      armR.rotation.set(0, 0, Math.PI * 0.75 + Math.sin(t * 11) * 0.3);
    } else if (active === 'clap') {
      const clap = 0.85 + 0.12 * Math.sin(t * 16);
      armL.rotation.set(-1.3, 0, clap);
      armR.rotation.set(-1.3, 0, -clap);
    } else if (active === 'thumbsup') {
      armR.rotation.set(-1.2, 0, -0.1);
    } else if (raised) {
      armR.rotation.set(0, 0, Math.PI * 0.9);
    }

    // Blinking animation: closed for ~120ms every 2-6s (except happy and sleepy eyes)
    const canBlink = person.avatar.eyes !== 'happy' && person.avatar.eyes !== 'sleepy';
    if (canBlink) {
      if (blinkDuration.current > 0) {
        blinkDuration.current -= dt;
        rig.eyes.scale.y = 0.1;
      } else {
        rig.eyes.scale.y = 1;
        nextBlink.current -= dt;
        if (nextBlink.current <= 0) {
          blinkDuration.current = 0.12;
          nextBlink.current = 2 + Math.random() * 4;
        }
      }
    } else {
      rig.eyes.scale.y = 1;
    }

    // Speaking mouth animation: rhythmic open/close
    if (speaking) {
      const mouthOpen = 0.5 + 0.5 * Math.sin(t * 14);
      rig.mouth.scale.set(1 + 0.15 * mouthOpen, 1 + 1.2 * mouthOpen, 1);
    } else {
      rig.mouth.scale.set(1, 1, 1);
    }

    // Speaking ring
    if (ring.current) {
      const m = ring.current.material as THREE.MeshBasicMaterial;
      m.opacity += ((speaking ? 0.85 : 0) - m.opacity) * Math.min(1, dt * 12);
      ring.current.scale.setScalar(1 + (speaking ? Math.sin(t * 9) * 0.08 : 0));
    }
  });

  // Dim avatar when away
  const dim = away ? 0.45 : 1;
  useEffect(() => {
    rig.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) {
        m.transparent = dim < 1;
        m.opacity = dim;
      }
    });
  }, [rig, dim]);

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.015} renderOrder={1}>
        <circleGeometry args={[0.38, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.03} renderOrder={2}>
        <ringGeometry args={[0.48, 0.62, 32]} />
        <meshBasicMaterial color="#35e08a" transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive
        object={rig.root}
        onPointerOver={(e: any) => {
          e.stopPropagation();
          hoverAvatar(id, true);
        }}
        onPointerOut={() => hoverAvatar(id, false)}
        onClick={(e: any) => {
          e.stopPropagation();
          useStore.getState().set({ selectedId: selected ? null : id });
        }}
      />
    </group>
  );
});
