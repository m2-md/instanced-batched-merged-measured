// tests/memory.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildInstanced } from "../src/build-instanced.js";
import { buildBatched } from "../src/build-batched.js";
import { memoryReport } from "../src/geometry-bytes.js";

it("InstancedMesh instance buffer: 1200 × (64 matrix + 12 color) = 91,200 B", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mem = memoryReport(buildInstanced(catalog, placements, new THREE.MeshBasicMaterial()));

  expect(mem.geometryBytes).toBe(81708); // the geometry is SHARED, so the catalog size
  expect(mem.instanceBytes).toBe(1200 * 64 + 1200 * 12);
  expect(mem.instanceBytes).toBe(91200);
  expect(mem.nodes).toBe(41); // 40 InstancedMesh + the root Group
});

it("BatchedMesh instance textures: matrix 72² + indirect 35² + color 35² = 107,444 B", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mem = memoryReport(buildBatched(catalog, placements, new THREE.MeshBasicMaterial()));

  // A single combined buffer: 40 geometries back to back, the same bytes as the catalog.
  expect(mem.geometryBytes).toBe(81708);
  expect(mem.uniqueGeometries).toBe(1);
  expect(mem.nodes).toBe(1);

  // three rounds the matrix texture up to a multiple of 4 (1 matrix = 4 pixels):
  // ceil(sqrt(1200 × 4) / 4) × 4 = 72 → 72 × 72 × 4 floats = 82,944 B.
  // The indirect and color textures have a side of ceil(sqrt(1200)) = 35.
  const matrices = 72 * 72 * 4 * 4;
  const indirect = 35 * 35 * 4;
  const colors = 35 * 35 * 4 * 4;
  expect(mem.instanceBytes).toBe(matrices + indirect + colors);
  expect(mem.instanceBytes).toBe(107444);
});
