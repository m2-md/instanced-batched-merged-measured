// src/build-naive.ts
import * as THREE from "three";
import type { CatalogEntry } from "./catalog.js";
import type { Placement } from "./level-plan.js";

const UP = new THREE.Vector3(0, 1, 0);

/** Yerleşim başına bir THREE.Mesh. Geometri ve materyal PAYLAŞILIR; ayrı olan sadece düğüm. */
export function buildNaive(
  catalog: CatalogEntry[],
  placements: Placement[],
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  for (const p of placements) {
    const mesh = new THREE.Mesh(catalog[p.typeIndex].geometry, material);
    mesh.position.set(p.x, p.scale * 0.5, p.z);
    mesh.quaternion.setFromAxisAngle(UP, p.rotY);
    mesh.scale.setScalar(p.scale);
    group.add(mesh);
  }
  return group;
}
