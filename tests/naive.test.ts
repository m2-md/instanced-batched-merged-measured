// tests/naive.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildNaive } from "../src/build-naive.js";
import { memoryReport } from "../src/geometry-bytes.js";

it("naif yol 1.200 düğüm kurar ama 40 geometri + 1 materyal paylaşır", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const material = new THREE.MeshBasicMaterial();
  const group = buildNaive(catalog, placements, material);

  expect(group.children).toHaveLength(1200);

  const geometries = new Set(group.children.map((c) => (c as THREE.Mesh).geometry.uuid));
  const materials = new Set(group.children.map((c) => (c as THREE.Mesh).material));
  expect(geometries.size).toBe(40);
  expect(materials.size).toBe(1);

  // Makalenin dürüstlük çizgisi: naif yolun bedeli BELLEK değil. GPU tamponu
  // katalogun aynısı — instance tamponu bile yok.
  const mem = memoryReport(group);
  expect(mem.geometryBytes).toBe(81708);
  expect(mem.instanceBytes).toBe(0);
  expect(mem.nodes).toBe(1201); // 1200 prop + kök Group
});
