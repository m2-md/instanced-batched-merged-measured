// bench/build-bench.ts — dört inşa yolunun KURULUM maliyetini ve GPU tampon
// faturasını tarayıcısız ölçer. Ölçülen şey WebGL değil, saf JavaScript: kurulum
// süresi + kare başına updateMatrixWorld. Draw call maliyeti burada GÖRÜNMEZ
// (WebGL bağlamı yok); onu demodaki M süpürmesi ölçüyor.
// Çalıştır: npm run bench
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildNaive } from "../src/build-naive.js";
import { buildInstanced } from "../src/build-instanced.js";
import { buildBatched, planBatchCapacity } from "../src/build-batched.js";
import { buildMerged } from "../src/build-merged.js";
import { formatBytes, geometryBytes, memoryReport } from "../src/geometry-bytes.js";

const TYPES = 40;
const PER_TYPE = 30;
const SEED = 1337;
const RUNS = 13; // tek sayı → medyan gerçek bir koşum
const MIN_BATCH_MS = 20; // kalibrasyon eşiği: bir örnek en az bu kadar sürsün
const MAX_ITERS = 262144; // tek düğümlü yollarda sonsuza gitmesin

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

/** fn'i RUNS kez ölçer, medyanı döner. Isınma için 3 koşum atılır. */
function medianOf(fn: () => void, runs = RUNS): number {
  for (let i = 0; i < 3; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  return median(samples);
}

/**
 * Çağrı başına süre. Mikrosaniyenin altındaki işi tek tek ölçmek saat
 * çözünürlüğüne çarpar; bu yüzden tekrar sayısını bir örnek MIN_BATCH_MS'i
 * geçene kadar dörtleyerek kalibre ediyoruz, sonra RUNS örneğin medyanını alıyoruz.
 */
function medianPerCall(fn: () => void): { ms: number; iters: number } {
  let iters = 64;
  while (iters < MAX_ITERS) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn();
    if (performance.now() - t0 >= MIN_BATCH_MS) break;
    iters *= 4;
  }
  const samples: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn();
    samples.push((performance.now() - t0) / iters);
  }
  return { ms: median(samples), iters };
}

const catalog = buildCatalog();
const placements = planLevel(TYPES, PER_TYPE, SEED);
const material = new THREE.MeshStandardMaterial();
const vertexColorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true });

// --- Katalog muhasebesi ---
let catVerts = 0;
let catIndices = 0;
let catBytes = 0;
for (const e of catalog) {
  catVerts += e.geometry.attributes.position.count;
  catIndices += e.geometry.index!.count;
  catBytes += geometryBytes(e.geometry);
}

console.log("=== KATALOG ===");
console.log(`tip:            ${catalog.length}`);
console.log(`vertex:         ${catVerts.toLocaleString("tr-TR")}`);
console.log(`index:          ${catIndices.toLocaleString("tr-TR")}`);
console.log(`tampon:         ${catBytes.toLocaleString("tr-TR")} B = ${formatBytes(catBytes)}`);
console.log(`index tipi:     ${catalog[0].geometry.index!.array.constructor.name}`);

const cap = planBatchCapacity(catalog, placements);
console.log("");
console.log("=== BATCH BÜTÇESİ ===");
console.log(JSON.stringify(cap));

// --- Dört yolun kurulum süresi ---
console.log("");
console.log("=== KURULUM (build) · medyan/" + RUNS + " koşum ===");
const buildNaiveMs = medianOf(() => void buildNaive(catalog, placements, material));
const buildInstMs = medianOf(() => void buildInstanced(catalog, placements, material));
const buildBatchMs = medianOf(() => void buildBatched(catalog, placements, material));
const buildMergedMs = medianOf(() => void buildMerged(catalog, placements, vertexColorMaterial));
console.log(`naif:           ${buildNaiveMs.toFixed(2)} ms`);
console.log(`instanced:      ${buildInstMs.toFixed(2)} ms`);
console.log(`batched:        ${buildBatchMs.toFixed(2)} ms`);
console.log(`merged:         ${buildMergedMs.toFixed(2)} ms`);
console.log(`merged/batched: ${(buildMergedMs / buildBatchMs).toFixed(1)}x`);

// --- Kare başına updateMatrixWorld ---
// three'nin her karede yaptığı iş: matrixAutoUpdate=true olan her düğüm için
// updateMatrix (compose) + matrixWorld çarpımı. force YOK; renderer da vermez.
const roots: Array<[string, THREE.Object3D]> = [
  ["naif", buildNaive(catalog, placements, material)],
  ["instanced", buildInstanced(catalog, placements, material)],
  ["batched", buildBatched(catalog, placements, material)],
  ["merged", buildMerged(catalog, placements, vertexColorMaterial)],
];

console.log("");
console.log("=== updateMatrixWorld · kare başına, medyan/" + RUNS + " koşum ===");
const graphMs: Record<string, number> = {};
for (const [name, root] of roots) {
  const { ms, iters } = medianPerCall(() => root.updateMatrixWorld());
  graphMs[name] = ms;
  const us = ms * 1000;
  console.log(
    `${name.padEnd(15)} ${us.toFixed(3).padStart(7)} µs = ${ms.toFixed(4)} ms` +
      `   (örnek başına ${iters} kare)`,
  );
}
console.log(`naif/instanced: ${(graphMs.naif / graphMs.instanced).toFixed(1)}x`);
console.log(`naif/batched:   ${(graphMs.naif / graphMs.batched).toFixed(1)}x`);

// --- GPU tampon faturası ---
console.log("");
console.log("=== GPU TAMPONU (yapısal) ===");
for (const [name, root] of roots) {
  const m = memoryReport(root);
  const total = m.geometryBytes + m.instanceBytes;
  console.log(
    `${name.padEnd(10)} geometri ${formatBytes(m.geometryBytes).padStart(9)}` +
      ` + instance ${formatBytes(m.instanceBytes).padStart(9)}` +
      ` = ${formatBytes(total).padStart(9)}` +
      ` · benzersiz geometri ${String(m.uniqueGeometries).padStart(2)}` +
      ` · düğüm(kök dahil) ${String(m.nodes).padStart(4)}`,
  );
}

// --- Merged geometrinin ayrıntılı faturası ---
const merged = roots[3][1] as THREE.Mesh;
const mg = merged.geometry;
const mergedVerts = mg.attributes.position.count;
const mergedIndex = mg.index!.count;
const mergedBytes = geometryBytes(mg);
const colorBytes = (mg.attributes.color as THREE.BufferAttribute).array.byteLength;
const instColorBytes = placements.length * 12;

console.log("");
console.log("=== MERGED FATURASI ===");
console.log(`merged verts:   ${mergedVerts.toLocaleString("tr-TR")}`);
console.log(`merged index:   ${mergedIndex.toLocaleString("tr-TR")}`);
console.log(`merged bytes:   ${mergedBytes.toLocaleString("tr-TR")} = ${formatBytes(mergedBytes)}`);
console.log(`index tipi:     ${mg.index!.array.constructor.name} (max index ${mergedVerts - 1})`);
console.log(`üçgen:          ${(mergedIndex / 3).toLocaleString("tr-TR")}`);
console.log(`merged/katalog: ${(mergedBytes / catBytes).toFixed(2)}x`);
console.log(
  `vertex rengi:   ${colorBytes.toLocaleString("tr-TR")} B = ${formatBytes(colorBytes)}` +
    ` · instance rengi ${instColorBytes.toLocaleString("tr-TR")} B` +
    ` → ${(colorBytes / instColorBytes).toFixed(2)}x`,
);

console.log("");
console.log(
  `plan: ${TYPES} tip × ${PER_TYPE} kopya = ${placements.length} örnek · tohum ${SEED}` +
    ` · node ${process.version} · three ${THREE.REVISION}`,
);
