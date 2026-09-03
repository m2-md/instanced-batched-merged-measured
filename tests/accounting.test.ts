// tests/accounting.test.ts — makalede geçen BAYT sayılarının kilidi.
// Katalog toplamı ve merged geometrinin faturası birer iddia; burada çivileniyor.
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildMerged } from "../src/build-merged.js";
import { geometryBytes } from "../src/geometry-bytes.js";

it("katalog toplamı: 2.169 vertex, 6.150 index, 81.708 bayt", () => {
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

it("merged fatura: Uint16 index, 3.232.080 bayt, katalogun 39,6 katı", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mesh = buildMerged(catalog, placements, new THREE.MeshBasicMaterial());

  // 65.070 vertex < 65.536 olduğu için mergeGeometries Uint16 index üretir.
  // Sahne büyürse bu Uint32'ye döner ve index tamponu iki katına çıkar.
  expect(mesh.geometry.index!.array).toBeInstanceOf(Uint16Array);
  expect(mesh.geometry.attributes.position.count).toBeLessThan(65536);

  // 65.070 × (12 pos + 12 normal + 8 uv + 12 color) + 184.500 × 2
  expect(geometryBytes(mesh.geometry)).toBe(65070 * 44 + 184500 * 2);
  expect(geometryBytes(mesh.geometry)).toBe(3232080);

  const catalogBytes = catalog.reduce((sum, e) => sum + geometryBytes(e.geometry), 0);
  expect(geometryBytes(mesh.geometry) / catalogBytes).toBeCloseTo(39.56, 1);

  // Vertex başına renk: aynı bilgi InstancedMesh'te örnek başına 12 bayttı.
  const colorBytes = (mesh.geometry.attributes.color as THREE.BufferAttribute).array.byteLength;
  expect(colorBytes).toBe(780840);
  expect(colorBytes / (placements.length * 12)).toBeCloseTo(54.23, 1);
});
