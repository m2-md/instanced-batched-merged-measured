// tests/parity.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildInstanced } from "../src/build-instanced.js";
import { buildBatched } from "../src/build-batched.js";

it("instanced and batched produce bit-for-bit identical matrices for the same placement", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const material = new THREE.MeshBasicMaterial();

  const instancedRoot = buildInstanced(catalog, placements, material);
  const batched = buildBatched(catalog, placements, material);

  // The batched instances were added in plan order: instanceId === plan index.
  const byType = new Map<number, number[]>();
  placements.forEach((p, i) => {
    if (!byType.has(p.typeIndex)) byType.set(p.typeIndex, []);
    byType.get(p.typeIndex)!.push(i);
  });

  const a = new THREE.Matrix4();
  const b = new THREE.Matrix4();
  for (const child of instancedRoot.children as THREE.InstancedMesh[]) {
    const typeIndex = catalog.findIndex((c) => c.geometry === child.geometry);
    const planIndices = byType.get(typeIndex)!;
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, a);
      batched.getMatrixAt(planIndices[i], b);
      for (let e = 0; e < 16; e++) expect(a.elements[e]).toBe(b.elements[e]);
    }
  }
});
