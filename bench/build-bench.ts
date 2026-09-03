// bench/build-bench.ts — measures the BUILD cost and the GPU buffer bill of the four
// build paths without a browser. What is measured is not WebGL but plain JavaScript:
// build time + updateMatrixWorld per frame. Draw call cost is INVISIBLE here (there is
// no WebGL context); that is what the M sweep in the demo measures.
// Run: npm run bench
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
const RUNS = 13; // odd number → the median is a real run
const MIN_BATCH_MS = 20; // calibration threshold: one sample must take at least this long
const MAX_ITERS = 262144; // don't let single-node paths run forever

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

/** Measures fn RUNS times and returns the median. 3 runs are thrown away as warmup. */
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
 * Time per call. Measuring sub-microsecond work one call at a time collides with the
 * clock resolution; so we calibrate by quadrupling the repeat count until one sample
 * exceeds MIN_BATCH_MS, then take the median of RUNS samples.
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

// --- Catalog accounting ---
let catVerts = 0;
let catIndices = 0;
let catBytes = 0;
for (const e of catalog) {
  catVerts += e.geometry.attributes.position.count;
  catIndices += e.geometry.index!.count;
  catBytes += geometryBytes(e.geometry);
}

console.log("=== CATALOG ===");
console.log(`types:          ${catalog.length}`);
console.log(`vertices:       ${catVerts.toLocaleString("en-US")}`);
console.log(`indices:        ${catIndices.toLocaleString("en-US")}`);
console.log(`buffer:         ${catBytes.toLocaleString("en-US")} B = ${formatBytes(catBytes)}`);
console.log(`index type:     ${catalog[0].geometry.index!.array.constructor.name}`);

const cap = planBatchCapacity(catalog, placements);
console.log("");
console.log("=== BATCH BUDGET ===");
console.log(JSON.stringify(cap));

// --- Build time of the four paths ---
console.log("");
console.log("=== BUILD · median of " + RUNS + " runs ===");
const buildNaiveMs = medianOf(() => void buildNaive(catalog, placements, material));
const buildInstMs = medianOf(() => void buildInstanced(catalog, placements, material));
const buildBatchMs = medianOf(() => void buildBatched(catalog, placements, material));
const buildMergedMs = medianOf(() => void buildMerged(catalog, placements, vertexColorMaterial));
console.log(`naive:          ${buildNaiveMs.toFixed(2)} ms`);
console.log(`instanced:      ${buildInstMs.toFixed(2)} ms`);
console.log(`batched:        ${buildBatchMs.toFixed(2)} ms`);
console.log(`merged:         ${buildMergedMs.toFixed(2)} ms`);
console.log(`merged/batched: ${(buildMergedMs / buildBatchMs).toFixed(1)}x`);

// --- updateMatrixWorld per frame ---
// The work three does every frame: updateMatrix (compose) + matrixWorld multiply for
// every node with matrixAutoUpdate=true. NO force; the renderer doesn't pass it either.
const roots: Array<[string, THREE.Object3D]> = [
  ["naive", buildNaive(catalog, placements, material)],
  ["instanced", buildInstanced(catalog, placements, material)],
  ["batched", buildBatched(catalog, placements, material)],
  ["merged", buildMerged(catalog, placements, vertexColorMaterial)],
];

console.log("");
console.log("=== updateMatrixWorld · per frame, median of " + RUNS + " runs ===");
const graphMs: Record<string, number> = {};
for (const [name, root] of roots) {
  const { ms, iters } = medianPerCall(() => root.updateMatrixWorld());
  graphMs[name] = ms;
  const us = ms * 1000;
  console.log(
    `${name.padEnd(16)} ${us.toFixed(3).padStart(7)} µs = ${ms.toFixed(4)} ms` +
      `   (${iters} frames per sample)`,
  );
}
console.log(`naive/instanced: ${(graphMs.naive / graphMs.instanced).toFixed(1)}x`);
console.log(`naive/batched:   ${(graphMs.naive / graphMs.batched).toFixed(1)}x`);

// --- GPU buffer bill ---
console.log("");
console.log("=== GPU BUFFERS (structural) ===");
for (const [name, root] of roots) {
  const m = memoryReport(root);
  const total = m.geometryBytes + m.instanceBytes;
  console.log(
    `${name.padEnd(10)} geometry ${formatBytes(m.geometryBytes).padStart(9)}` +
      ` + instance ${formatBytes(m.instanceBytes).padStart(9)}` +
      ` = ${formatBytes(total).padStart(9)}` +
      ` · unique geometries ${String(m.uniqueGeometries).padStart(2)}` +
      ` · nodes(root incl.) ${String(m.nodes).padStart(4)}`,
  );
}

// --- Detailed bill of the merged geometry ---
const merged = roots[3][1] as THREE.Mesh;
const mg = merged.geometry;
const mergedVerts = mg.attributes.position.count;
const mergedIndex = mg.index!.count;
const mergedBytes = geometryBytes(mg);
const colorBytes = (mg.attributes.color as THREE.BufferAttribute).array.byteLength;
const instColorBytes = placements.length * 12;

console.log("");
console.log("=== MERGED BILL ===");
console.log(`merged verts:   ${mergedVerts.toLocaleString("en-US")}`);
console.log(`merged index:   ${mergedIndex.toLocaleString("en-US")}`);
console.log(`merged bytes:   ${mergedBytes.toLocaleString("en-US")} = ${formatBytes(mergedBytes)}`);
console.log(`index type:     ${mg.index!.array.constructor.name} (max index ${mergedVerts - 1})`);
console.log(`triangles:      ${(mergedIndex / 3).toLocaleString("en-US")}`);
console.log(`merged/catalog: ${(mergedBytes / catBytes).toFixed(2)}x`);
console.log(
  `vertex color:   ${colorBytes.toLocaleString("en-US")} B = ${formatBytes(colorBytes)}` +
    ` · instance color ${instColorBytes.toLocaleString("en-US")} B` +
    ` → ${(colorBytes / instColorBytes).toFixed(2)}x`,
);

console.log("");
console.log(
  `plan: ${TYPES} types × ${PER_TYPE} copies = ${placements.length} instances · seed ${SEED}` +
    ` · node ${process.version} · three ${THREE.REVISION}`,
);
