// tests/batched.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildBatched, planBatchCapacity } from "../src/build-batched.js";

it("bütçe benzersiz geometriye göre ölçeklenir, örnek sayısına göre değil", () => {
  const catalog = buildCatalog();
  const small = planBatchCapacity(catalog, planLevel(40, 5, 1));
  const large = planBatchCapacity(catalog, planLevel(40, 50, 1));

  // Örnek sayısı 10 kat arttı...
  expect(large.maxInstanceCount).toBe(small.maxInstanceCount * 10);
  // ...vertex/index bütçesi kılını kıpırdatmadı.
  expect(large.maxVertexCount).toBe(small.maxVertexCount);
  expect(large.maxIndexCount).toBe(small.maxIndexCount);
  expect(large.maxVertexCount).toBe(2169);
  expect(large.maxIndexCount).toBe(6150);
});

it("hesaplanan bütçe tam oturur, bir eksiği atar", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mesh = buildBatched(catalog, placements, new THREE.MeshBasicMaterial());

  expect(mesh.instanceCount).toBe(1200);
  expect(mesh.unusedVertexCount).toBe(0); // bütçe tam; ne fazla ne eksik
  expect(mesh.unusedIndexCount).toBe(0);

  const cap = planBatchCapacity(catalog, placements);
  const tight = new THREE.BatchedMesh(
    cap.maxInstanceCount,
    cap.maxVertexCount - 1, // bir vertex eksik
    cap.maxIndexCount,
    new THREE.MeshBasicMaterial(),
  );
  expect(() => {
    for (let t = 0; t < 40; t++) tight.addGeometry(catalog[t].geometry);
  }).toThrow(/maximum buffer size/i);
});
