// tests/naive.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildNaive } from "../src/build-naive.js";
import { memoryReport } from "../src/geometry-bytes.js";

it("the naive path builds 1,200 nodes but shares 40 geometries + 1 material", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const material = new THREE.MeshBasicMaterial();
  const group = buildNaive(catalog, placements, material);

  expect(group.children).toHaveLength(1200);

  const geometries = new Set(group.children.map((c) => (c as THREE.Mesh).geometry.uuid));
  const materials = new Set(group.children.map((c) => (c as THREE.Mesh).material));
  expect(geometries.size).toBe(40);
  expect(materials.size).toBe(1);

  // The article's honesty line: the naive path's cost is not MEMORY. The GPU buffer
  // is identical to the catalog — there isn't even an instance buffer.
  const mem = memoryReport(group);
  expect(mem.geometryBytes).toBe(81708);
  expect(mem.instanceBytes).toBe(0);
  expect(mem.nodes).toBe(1201); // 1200 props + the root Group
});
