// tests/batched.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildBatched, planBatchCapacity } from "../src/build-batched.js";

it("the budget scales with unique geometry, not with instance count", () => {
  const catalog = buildCatalog();
  const small = planBatchCapacity(catalog, planLevel(40, 5, 1));
  const large = planBatchCapacity(catalog, planLevel(40, 50, 1));

  // The instance count went up 10×...
  expect(large.maxInstanceCount).toBe(small.maxInstanceCount * 10);
  // ...the vertex/index budget did not move a muscle.
  expect(large.maxVertexCount).toBe(small.maxVertexCount);
  expect(large.maxIndexCount).toBe(small.maxIndexCount);
  expect(large.maxVertexCount).toBe(2169);
  expect(large.maxIndexCount).toBe(6150);
});

it("the computed budget fits exactly, one short throws", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mesh = buildBatched(catalog, placements, new THREE.MeshBasicMaterial());

  expect(mesh.instanceCount).toBe(1200);
  expect(mesh.unusedVertexCount).toBe(0); // the budget is exact; nothing spare, nothing short
  expect(mesh.unusedIndexCount).toBe(0);

  const cap = planBatchCapacity(catalog, placements);
  const tight = new THREE.BatchedMesh(
    cap.maxInstanceCount,
    cap.maxVertexCount - 1, // one vertex short
    cap.maxIndexCount,
    new THREE.MeshBasicMaterial(),
  );
  expect(() => {
    for (let t = 0; t < 40; t++) tight.addGeometry(catalog[t].geometry);
  }).toThrow(/maximum buffer size/i);
});
