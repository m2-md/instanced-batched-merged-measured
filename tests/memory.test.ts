// tests/memory.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildInstanced } from "../src/build-instanced.js";
import { buildBatched } from "../src/build-batched.js";
import { memoryReport } from "../src/geometry-bytes.js";

it("InstancedMesh instance tamponu: 1200 × (64 matris + 12 renk) = 91.200 B", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mem = memoryReport(buildInstanced(catalog, placements, new THREE.MeshBasicMaterial()));

  expect(mem.geometryBytes).toBe(81708); // geometri PAYLAŞILIYOR, katalog kadar
  expect(mem.instanceBytes).toBe(1200 * 64 + 1200 * 12);
  expect(mem.instanceBytes).toBe(91200);
  expect(mem.nodes).toBe(41); // 40 InstancedMesh + kök Group
});

it("BatchedMesh instance dokuları: matris 72² + indirect 35² + renk 35² = 107.444 B", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mem = memoryReport(buildBatched(catalog, placements, new THREE.MeshBasicMaterial()));

  // Tek bir birleşik tampon: 40 geometri arka arkaya, katalogla aynı bayt.
  expect(mem.geometryBytes).toBe(81708);
  expect(mem.uniqueGeometries).toBe(1);
  expect(mem.nodes).toBe(1);

  // three matris dokusunu 4'ün katına yuvarlar (1 matris = 4 piksel):
  // ceil(sqrt(1200 × 4) / 4) × 4 = 72 → 72 × 72 × 4 float = 82.944 B.
  // indirect ve renk dokuları ceil(sqrt(1200)) = 35 kenarlı.
  const matrices = 72 * 72 * 4 * 4;
  const indirect = 35 * 35 * 4;
  const colors = 35 * 35 * 4 * 4;
  expect(mem.instanceBytes).toBe(matrices + indirect + colors);
  expect(mem.instanceBytes).toBe(107444);
});
