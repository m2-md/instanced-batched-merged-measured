// src/level-plan.ts
import * as THREE from "three";
import { mulberry32 } from "./rng.js";

export interface Placement {
  typeIndex: number; // type in the catalog (0..39)
  x: number;
  z: number;
  rotY: number;
  scale: number;
  hue: number; // 0..1, for per-instance color
}

/** perType copies of each of typeCount types; same seed, same result. */
export function planLevel(typeCount: number, perType: number, seed: number): Placement[] {
  const rng = mulberry32(seed);
  const out: Placement[] = [];
  const half = 26;
  for (let t = 0; t < typeCount; t++) {
    for (let k = 0; k < perType; k++) {
      out.push({
        typeIndex: t,
        x: (rng() * 2 - 1) * half,
        z: (rng() * 2 - 1) * half,
        rotY: rng() * Math.PI * 2,
        scale: 0.75 + rng() * 0.8,
        hue: rng(),
      });
    }
  }
  // Deterministic Fisher-Yates: let the types arrive at the scene shuffled, leave
  // the grouping to the build function. A real level editor won't hand them sorted either.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** Compiles a placement into a 4x4 matrix. Scratches live outside the loop: zero allocation per frame. */
export function placementMatrix(p: Placement, target: THREE.Matrix4): THREE.Matrix4 {
  _p.set(p.x, p.scale * 0.5, p.z);
  _q.setFromAxisAngle(UP, p.rotY);
  _s.setScalar(p.scale);
  return target.compose(_p, _q, _s);
}
