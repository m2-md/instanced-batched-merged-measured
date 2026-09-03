// tests/merged.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildMerged } from "../src/build-merged.js";

it("birleştirilmiş vertex/index sayısı parçaların toplamına eşittir", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);

  let expectedVerts = 0;
  let expectedIndices = 0;
  for (const p of placements) {
    const g = catalog[p.typeIndex].geometry;
    expectedVerts += g.attributes.position.count;
    expectedIndices += g.index!.count;
  }

  const mesh = buildMerged(catalog, placements, new THREE.MeshBasicMaterial());
  expect(mesh.geometry.attributes.position.count).toBe(expectedVerts); // 65.070
  expect(mesh.geometry.index!.count).toBe(expectedIndices); // 184.500
  // Renk vertex başına pişti: aynı sayıda color girdisi olmalı.
  expect(mesh.geometry.attributes.color.count).toBe(expectedVerts);
});
