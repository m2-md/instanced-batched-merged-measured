// tests/accounting.test.ts — the lock on the BYTE numbers quoted in the article.
// The catalog total and the merged geometry's bill are both claims; they get nailed down here.
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildMerged } from "../src/build-merged.js";
import { geometryBytes } from "../src/geometry-bytes.js";

it("catalog total: 2,169 vertices, 6,150 indices, 81,708 bytes", () => {
  const catalog = buildCatalog();
  let verts = 0;
  let indices = 0;
  let bytes = 0;
  for (const e of catalog) {
    verts += e.geometry.attributes.position.count;
    indices += e.geometry.index!.count;
    bytes += geometryBytes(e.geometry);
  }
  expect(verts).toBe(2169);
  expect(indices).toBe(6150);
  // 2169 × (12 pos + 12 normal + 8 uv) + 6150 × 2 (Uint16 index)
  expect(bytes).toBe(2169 * 32 + 6150 * 2);
  expect(bytes).toBe(81708);
});

it("merged bill: Uint16 index, 3,232,080 bytes, 39.6× the catalog", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mesh = buildMerged(catalog, placements, new THREE.MeshBasicMaterial());

  // Because 65,070 vertices < 65,536, mergeGeometries produces a Uint16 index.
  // If the scene grows this turns into Uint32 and the index buffer doubles.
  expect(mesh.geometry.index!.array).toBeInstanceOf(Uint16Array);
  expect(mesh.geometry.attributes.position.count).toBeLessThan(65536);

  // 65,070 × (12 pos + 12 normal + 8 uv + 12 color) + 184,500 × 2
  expect(geometryBytes(mesh.geometry)).toBe(65070 * 44 + 184500 * 2);
  expect(geometryBytes(mesh.geometry)).toBe(3232080);

  const catalogBytes = catalog.reduce((sum, e) => sum + geometryBytes(e.geometry), 0);
  expect(geometryBytes(mesh.geometry) / catalogBytes).toBeCloseTo(39.56, 1);

  // Color per vertex: the same information cost 12 bytes per instance on InstancedMesh.
  const colorBytes = (mesh.geometry.attributes.color as THREE.BufferAttribute).array.byteLength;
  expect(colorBytes).toBe(780840);
  expect(colorBytes / (placements.length * 12)).toBeCloseTo(54.23, 1);
});
