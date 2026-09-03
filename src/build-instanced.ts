// src/build-instanced.ts
import * as THREE from "three";
import type { CatalogEntry } from "./catalog.js";
import { placementMatrix, type Placement } from "./level-plan.js";

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** One InstancedMesh per prop TYPE. 40 types → 40 draw calls. */
export function buildInstanced(
  catalog: CatalogEntry[],
  placements: Placement[],
  material: THREE.Material,
): THREE.Group {
  const byType = new Map<number, Placement[]>();
  for (const p of placements) {
    let list = byType.get(p.typeIndex);
    if (!list) {
      list = [];
      byType.set(p.typeIndex, list);
    }
    list.push(p);
  }

  const group = new THREE.Group();
  for (const [typeIndex, list] of byType) {
    const mesh = new THREE.InstancedMesh(catalog[typeIndex].geometry, material, list.length);
    for (let i = 0; i < list.length; i++) {
      placementMatrix(list[i], _m);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHSL(list[i].hue, 0.45, 0.55));
    }
    mesh.instanceMatrix.needsUpdate = true;
    // instanceColor is born on the first setColorAt call; before that it is null.
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
