# One Scene, Four Build Paths — InstancedMesh · BatchedMesh · mergeGeometries

<!-- LINKS:BEGIN — üretildi: scripts/sync-repo-links.py · elle düzenleme -->
**▶ [Live demo](https://m2-md.github.io/instanced-batched-merged-measured/)** · [Source](https://github.com/m2-md/instanced-batched-merged-measured)
<!-- LINKS:END -->

The working code behind the article "InstancedMesh, BatchedMesh or mergeGeometries?
One Scene, Three Build Paths, One Measured Decision Table". A single seeded level plan
(40 prop types × 30 copies = **1,200 props**, one material) is built four different ways:

1. **Naive** — one `THREE.Mesh` per prop (geometry and material are shared).
2. **InstancedMesh** — one mesh per prop TYPE, 40 draw calls.
3. **BatchedMesh** — 40 distinct geometries + 1,200 instances, a single draw call.
4. **mergeGeometries** — everything in one giant `BufferGeometry`, the transform baked into the vertices.

The core idea: the whole build layer (`src/build-*.ts`) is decoupled from rendering. It
never sees a `WebGLRenderer`, a camera, or `requestAnimationFrame`. That is why the
correctness of the four paths can be proven **without opening a browser** (`npm test`),
while the CPU bill is measured in the browser with a short, manually triggered sweep (the `M` key).

## Versions

- `three@0.185.1` + `@types/three` — `BatchedMesh` (r156+), `BufferGeometryUtils`,
  `RoomEnvironment`, `UnrealBloomPass`; all inside the package, no external assets.
- Vite + TypeScript + Vitest, npm.
- Shadows: `PCFShadowMap` (`PCFSoftShadowMap` is deprecated in r185).

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

`http://localhost:5173/` — **do NOT open it with `file://`**, ES modules won't load and
you'll see a blank screen. The Vite dev server is mandatory.

### Keys

| Key | What it does |
|---|---|
| `1` `2` `3` `4` | switch to the naive · instanced · batched · merged path (the scene is torn down and rebuilt) |
| `M` | short CPU frame sweep: 20 warmup + 120 measured frames per path |
| `G` | props-only GL call probe: the real `renderer.info.render.calls` in a separate 1×1 renderer |
| `C` | toggle `BatchedMesh.perObjectFrustumCulled` + `sortObjects` (the sweep runs with this value too) |
| `P` | automatic orbit ↔ manual orbit (drag with the mouse) |
| click | raycast: instanced → `instanceId`, batched → `batchId`, merged → only `faceIndex` |

URL parameters: `?path=1..4` picks the opening path, `?nocull=1` starts with batch culling
off, `?bench=1` runs the probe + sweep on its own and writes the result to
`bench-result.json` (see below).

### HUD: MEASUREMENT or MODEL?

Every number in the HUD is labeled, because mixing the two up makes it very easy to
write "1 draw call" and draw 1,200:

- `· REAL` → a **measurement** read that frame from `renderer.info` or `performance.now()`.
  `GL CALLS · REAL` is the ENTIRE scene: props + ground + grid + background +
  the `RenderPass`/`UnrealBloomPass`/`OutputPass` chain.
- `· MODEL` → a direct consequence of the architecture, not a measurement: `PROP DRAW`,
  `SCENE NODES`, geometry/instance buffer bytes.

## Tests (no browser needed)

```bash
npm test
```

**13 tests must be green**:

| File | What it proves |
|---|---|
| `tests/level-plan.test.ts` (3) | same seed → same plan (FNV-1a hash), different seed → different plan, exactly 30 copies of every type |
| `tests/catalog.test.ts` (1) | all 40 geometries are indexed and the attribute set is `normal/position/uv` — `BatchedMesh`'s two conditions |
| `tests/batched.test.ts` (2) | the budget scales with UNIQUE geometry, not instance count (2,169/6,150); the computed budget fits exactly, one vertex short throws `maximum buffer size` |
| `tests/merged.test.ts` (1) | the merged vertex/index count equals the sum of the parts (65,070 / 184,500) and color is baked per vertex |
| `tests/parity.test.ts` (1) | the instanced and batched paths produce **bit-for-bit** identical matrices for the same placement |
| `tests/naive.test.ts` (1) | 1,200 nodes but 40 geometries + 1 material shared; instance buffer is 0 bytes |
| `tests/memory.test.ts` (2) | InstancedMesh instance buffer is 91,200 B; BatchedMesh textures are 107,444 B (72² matrix + 35² indirect + 35² color) |
| `tests/accounting.test.ts` (2) | the catalog is 81,708 B; the merged geometry is 3,232,080 B with a **Uint16** index = 39.6× the catalog; vertex color is 780,840 B = 54.2× the instance color |

## Measurement

### 1. Node side: build + scene graph (`npm run bench`)

```bash
npm run bench
```

Measurement conditions: Apple M2 Pro (Mac14,9), Node 22.22.2, `three@0.185.1`, the median
of 13 runs. The per-call measurement of `updateMatrixWorld` is calibrated: the repeat count
is quadrupled until one sample passes 20 ms (measuring sub-microsecond work one call at a
time collides with the clock resolution).

| Path | Build | `updateMatrixWorld`/frame |
|---|---|---|
| Naive | 1.7 ms | 38.7 µs |
| InstancedMesh | 0.55 ms | 1.12 µs |
| BatchedMesh | 0.70 ms | 0.017 µs |
| mergeGeometries | 34.0 ms | 0.017 µs |

The same run also prints the structural buffer bill: the catalog is 81,708 B (79.8 KB),
instanced +91,200 B, batched +107,444 B of textures, merged 3,232,080 B (3.08 MB).

### 2. Browser side: CPU frame time (the `M` key)

The sweep is kept decoupled from rendering — what is measured is the CPU cost of
**issuing** the draw calls:

- a plain `renderer.render` into a 640×360 `WebGLRenderTarget` (NO post-process chain),
- `shadowMap.autoUpdate = false` (the shadow map is drawn once per build),
- the camera pose is tied to the frame index (`cameraPose(f, 120)`), so the four paths see
  the same 140 frames from the same poses,
- 20 warmup + 120 measured frames per path; the whole sweep takes **~0.5 s**.

Measurement conditions: Apple M2 Pro (Mac14,9), Chrome 150 headless (ANGLE Metal), dpr 1,
the median of five runs:

| Path | CPU frame p50 | CPU frame p95 | GL calls (sweep frame) | Triangles |
|---|---|---|---|---|
| Naive | 1.51 ms | 1.69 ms | 1,042 | 52,976 |
| InstancedMesh | 0.065 ms | 0.075 ms | 43 | 61,504 |
| BatchedMesh | 0.26 ms | 0.30 ms | 4 | 52,976 |
| mergeGeometries | 0.020 ms | 0.030 ms | 4 | 61,504 |

The GL calls and triangle counts in the sweep frame belong to the **entire scene**
(props + ground + grid + background = 3 extra calls). The naive path and `BatchedMesh`
cull at instance level, so their triangle count drops with the framing (52,976); the
instanced and merged paths do not (61,504).

If `perObjectFrustumCulled` + `sortObjects` are turned off with `C`, the `BatchedMesh` p50
drops from **0.26 ms to 0.020 ms**: that entire difference is the price of culling and
sorting 1,200 instances on the CPU every frame.

The REAL frame time of the same scene including the post-process chain (1440×900, dpr 1,
naive path, bloom + shadows on): p50 2.26 ms · p95 2.53 ms · 1,078 GL calls.

### 3. The measured version of the structural table (the `G` key)

`G` draws each of the four paths once in a separate 1×1 `WebGLRenderer` (orthographic box,
no culling) and reads the real counter — without the ground, the shadows and the
post-processing getting in the way:

| Path | `renderer.info.render.calls` | Triangles |
|---|---|---|
| Naive | 1,200 | 61,500 |
| InstancedMesh | 40 | 61,500 |
| BatchedMesh | 1 | 61,500 |
| mergeGeometries | 1 | 61,500 |

`BatchedMesh`'s "1" depends on the `WEBGL_multi_draw` extension; without it three falls
back to a loop and the counter approaches the instance count. The `WEBGL_MULTI_DRAW: YES/NO`
label in the HUD exists for exactly this reason.

### `?bench=1` — writing the measurement to disk

The `bench-sink` plugin inside `vite.config.ts` listens on `POST /__bench`; if the demo is
opened with `?bench=1`, the probe + sweep run on their own and the result is written to the
project root as `bench-result.json` (GPU name, `crossOriginIsolated`, p50/p95, probe,
buffer report).

The dev server sends **COOP/COEP** headers (`vite.config.ts`): without cross-origin
isolation Chrome rounds `performance.now()` to 100 µs and the merged path's frame time
shows up as a flat `0.00 ms`. In an isolated context the clock goes to 5 µs resolution.

## Build

```bash
npm run build      # tsc && vite build
npm run preview
```

## File layout

```
src/
  rng.ts              # mulberry32 — seeded generator
  catalog.ts          # 8 families × 5 sizes = 40 prop types (PolyhedronGeometry goes through mergeVertices)
  level-plan.ts       # planLevel + placementMatrix (scratches outside the loop)
  build-naive.ts      # one Mesh per prop
  build-instanced.ts  # one InstancedMesh per type
  build-batched.ts    # planBatchCapacity + a single BatchedMesh
  build-merged.ts     # mergeGeometries + vertex colors
  camera-path.ts      # deterministic orbit driven by the frame index
  frame-timer.ts      # ring buffer (from the first article in the series)
  stats.ts            # percentile / p50 / p95 / mean
  measure.ts          # measurePath: warmup + measurement + counter read
  geometry-bytes.ts   # attribute/index byte accounting + memoryReport
  gl-probe.ts         # props-only draw call probe in a 1×1 renderer
  main.ts             # demo: four paths, keys, sweep, raycast
  view/
    stage.ts          # dark cinematic scene, PCFShadowMap, RoomEnvironment/PMREM
    hud.ts            # glass-panel HUD; the REAL/MODEL distinction
    postfx.ts         # EffectComposer + UnrealBloomPass (half resolution) + OutputPass
bench/
  build-bench.ts      # Node measurement: build + updateMatrixWorld + buffer bill
tests/                # 8 files, 13 tests — none of them opens a browser
```

## Known limits (honesty notes)

- **Because the naive path shares one material it cannot take a per-instance color.** The
  triangle and draw call counts of the four paths are the same, but the naive scene looks
  single-toned. If you want to give the naive path a per-instance color too, you need one
  material per mesh — at that point geometry/material sharing ends and the comparison breaks.
- **`BatchedMesh` instance textures are read from private fields**
  (`_matricesTexture`, `_indirectTexture`, `_colorsTexture`). `geometry-bytes.ts` skips a
  field silently if it is missing; if three renames these fields the byte count drops to 0
  rather than blowing up.
- **The sweep numbers are not the demo's live frame time.** During the sweep the bloom and
  shadow passes are off and the target is 640×360. The live frame time sits separately in
  the HUD's `CPU FRAME p50/p95` row.
- The measurements were taken with headless Chrome (real GPU: ANGLE Metal / M2 Pro). The
  absolute values will differ on your machine; the ratios come from the architecture.

## License

MIT — see `LICENSE`.
