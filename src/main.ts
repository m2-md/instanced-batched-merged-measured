// src/main.ts — demo: aynı seviye dolgusu (40 tip, 1.200 prop), dört inşa yolu,
// tuşla geçiş. Sayıların hangisi ÖLÇÜM hangisi MODEL olduğu HUD'da etiketli.
//   1/2/3/4 → naif Mesh · InstancedMesh · BatchedMesh · mergeGeometries
//   M       → kısa CPU kare süpürmesi (20 ısınma + 120 ölçüm, yol başına)
//   G       → props-only GL çağrı probe'u (ayrı 1×1 renderer)
//   C       → BatchedMesh.perObjectFrustumCulled + sortObjects aç/kapat
//   P       → otomatik yörünge / elle orbit
//   tık     → raycast: instanceId · batchId · faceIndex
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildCatalog } from "./catalog.js";
import { planLevel } from "./level-plan.js";
import { buildNaive } from "./build-naive.js";
import { buildInstanced } from "./build-instanced.js";
import { buildBatched } from "./build-batched.js";
import { buildMerged } from "./build-merged.js";
import { cameraPose } from "./camera-path.js";
import { FrameTimer } from "./frame-timer.js";
import { p50, p95 } from "./stats.js";
import { MEASURE_FRAMES, measurePath, WARMUP_FRAMES, type PathResult } from "./measure.js";
import { formatBytes, memoryReport } from "./geometry-bytes.js";
import { probeDrawCalls, type ProbeRow } from "./gl-probe.js";
import { createGround, createPropMaterial, createStage } from "./view/stage.js";
import { createPostFx } from "./view/postfx.js";
import { collectHudElements, Hud } from "./view/hud.js";

const TYPES = 40;
const PER_TYPE = 30;
const SEED = 1337;
const ORBIT_FRAMES = 900; // canlı yörüngenin bir turu (~15 s @60fps)
const SWEEP_WIDTH = 640; // süpürme hedefi küçük: GPU değil CPU baskın olsun
const SWEEP_HEIGHT = 360;

const catalog = buildCatalog();
const placements = planLevel(TYPES, PER_TYPE, SEED);
const catalogUuids = new Set(catalog.map((e) => e.geometry.uuid));

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const stage = createStage(canvas);
createGround(stage.scene);
const postfx = createPostFx(stage.renderer, stage.scene, stage.camera);
const hud = new Hud(collectHudElements());

const propMaterial = createPropMaterial(false);
const mergedMaterial = createPropMaterial(true);

const controls = new OrbitControls(stage.camera, canvas);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = 120;
controls.maxPolarAngle = Math.PI * 0.49;
controls.enabled = false; // otomatik yörünge açıkken kamerayı biz sürüyoruz

interface BuildPath {
  name: string;
  propDraw: number; // MODEL: prop'ları çizmenin yapısal çağrı sayısı
  vertexColors: boolean;
  make: (material: THREE.Material) => THREE.Object3D;
}

const PATHS: BuildPath[] = [
  {
    name: "NAIVE MESH",
    propDraw: placements.length,
    vertexColors: false,
    make: (m) => buildNaive(catalog, placements, m),
  },
  {
    name: "INSTANCED",
    propDraw: TYPES,
    vertexColors: false,
    make: (m) => buildInstanced(catalog, placements, m),
  },
  {
    name: "BATCHED",
    propDraw: 1,
    vertexColors: false,
    make: (m) => buildBatched(catalog, placements, m),
  },
  {
    name: "MERGED",
    propDraw: 1,
    vertexColors: true,
    make: (m) => buildMerged(catalog, placements, m),
  },
];

function materialFor(path: BuildPath): THREE.Material {
  return path.vertexColors ? mergedMaterial : propMaterial;
}

/**
 * Kökü serbest bırakır. Katalog geometrisi DÖRT yolda da paylaşıldığı için
 * onu dispose etmek yasak; ederse ikinci yola geçtiğinde sahne boşalır.
 */
function releaseRoot(root: THREE.Object3D): void {
  root.traverse((o) => {
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      inst.dispose(); // instanceMatrix + instanceColor tamponları
      return;
    }
    const batched = o as THREE.BatchedMesh;
    if (batched.isBatchedMesh) {
      batched.dispose(); // birleşik tampon + matris/renk dokuları
      return;
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && !catalogUuids.has(mesh.geometry.uuid)) {
      mesh.geometry.dispose(); // yalnızca merged yolun kendi geometrisi
    }
  });
}

function applyShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.castShadow = true;
  });
}

// --- Aktif yol ---
let pathIndex = -1;
let root: THREE.Object3D | null = null;
let buildMs = 0;
let structural = { geometryBytes: 0, instanceBytes: 0, nodes: 0 };

function setPath(index: number): void {
  if (root) {
    stage.scene.remove(root);
    releaseRoot(root);
    root = null;
  }
  pathIndex = index;
  const path = PATHS[index];

  const t0 = performance.now();
  root = path.make(materialFor(path));
  buildMs = performance.now() - t0;

  applyBatchedFlags(root);
  applyShadows(root);
  stage.scene.add(root);
  // Gölge haritası kare başına değil, inşa başına bir kez çizilir.
  stage.renderer.shadowMap.needsUpdate = true;

  const mem = memoryReport(root);
  structural = {
    geometryBytes: mem.geometryBytes,
    instanceBytes: mem.instanceBytes,
    nodes: mem.nodes,
  };
  timer.reset();
  hud.setPath(index, path.name);
  hud.setFlags(hasMultiDraw, cullingFlag());
  hud.setPick("—");
  console.log(
    `[${path.name}] build ${buildMs.toFixed(2)} ms · geometri ${formatBytes(mem.geometryBytes)}` +
      ` + instance ${formatBytes(mem.instanceBytes)} · düğüm ${mem.nodes}`,
  );
}

// BatchedMesh'in per-object elemesi ve derinlik sıralaması CPU'da koşar; ikisi de
// varsayılan olarak AÇIK. C tuşu bu bayrağı çevirir ve süpürme de bu değerle
// koşar — böylece "tek çizim çağrısı ama CPU'da 1.200 örnek eleniyor" farkını
// aynı ölçüm aletiyle görebiliyorsun.
let batchedCulling = new URLSearchParams(location.search).get("nocull") !== "1";

function applyBatchedFlags(o: THREE.Object3D): void {
  const batched = o as THREE.BatchedMesh;
  if (!batched.isBatchedMesh) return;
  batched.perObjectFrustumCulled = batchedCulling;
  batched.sortObjects = batchedCulling;
}

function cullingFlag(): boolean {
  return batchedCulling;
}

const hasMultiDraw = stage.renderer.extensions.has("WEBGL_multi_draw");

// --- Canlı döngü ---
const timer = new FrameTimer(120);
const _pose = new THREE.Vector3();
let frame = 0;
let autoOrbit = true;
let busy = false;

function tick(): void {
  requestAnimationFrame(tick);
  if (busy) return; // süpürme/probe kendi döngüsünü koşuyor

  timer.begin();
  if (autoOrbit) {
    cameraPose(frame, ORBIT_FRAMES, _pose);
    stage.camera.position.copy(_pose);
    stage.camera.lookAt(0, 2, 0);
  } else {
    controls.update();
  }
  stage.renderer.info.reset(); // autoReset=false: post-process pass'leri de sayılsın
  postfx.composer.render();
  timer.end();

  frame++;
  if (frame % 10 === 0) {
    const v = timer.values();
    hud.render({
      calls: stage.renderer.info.render.calls,
      triangles: stage.renderer.info.render.triangles,
      propDraw: PATHS[pathIndex].propDraw,
      nodes: structural.nodes,
      cpuP50: p50(v),
      cpuP95: p95(v),
      geometryBytes: structural.geometryBytes,
      instanceBytes: structural.instanceBytes,
      buildMs,
    });
  }
}

// --- M: kısa CPU kare süpürmesi ---
// Ölçüm render'dan ayrık tutulur: gölge geçişi ve bloom zinciri dışarıda
// (shadowMap.autoUpdate=false + düz renderer.render), hedef 640×360, kamera
// kare indeksine bağlı. Dört yol da aynı 140 kareyi aynı pozlardan görür.
const sweepTarget = new THREE.WebGLRenderTarget(SWEEP_WIDTH, SWEEP_HEIGHT);
const sweepCamera = new THREE.PerspectiveCamera(52, SWEEP_WIDTH / SWEEP_HEIGHT, 0.1, 400);

function sweepOne(index: number): PathResult {
  const path = PATHS[index];
  const local = path.make(materialFor(path));
  applyBatchedFlags(local);
  applyShadows(local);
  stage.scene.add(local);
  const nodes = memoryReport(local).nodes;

  const result = measurePath(
    path.name,
    (f) => {
      cameraPose(f, MEASURE_FRAMES, _pose);
      sweepCamera.position.copy(_pose);
      sweepCamera.lookAt(0, 2, 0);
      stage.renderer.info.reset();
      stage.renderer.render(stage.scene, sweepCamera);
    },
    () => ({
      calls: stage.renderer.info.render.calls,
      triangles: stage.renderer.info.render.triangles,
      nodes,
    }),
  );

  stage.scene.remove(local);
  releaseRoot(local);
  return result;
}

let sweepMs = 0;

function runSweep(onDone?: (results: PathResult[]) => void): void {
  if (busy) return;
  busy = true;
  hud.setBusy("CPU SWEEP…");
  const results: PathResult[] = [];
  const restore = pathIndex;
  const sweepStart = performance.now();

  // Aktif kökü sahneden çıkar: ölçülen yolun üstüne başka bir yol çizilmesin.
  if (root) {
    stage.scene.remove(root);
    releaseRoot(root);
    root = null;
  }
  stage.renderer.setRenderTarget(sweepTarget);

  // Bloke edici işi parçalara böl: yol başına bir setTimeout(fn, 0). Burada
  // requestAnimationFrame İŞE YARAMAZ — sekme arkada kalırsa hiç çağrılmaz.
  const step = (i: number): void => {
    if (i < PATHS.length) {
      results.push(sweepOne(i));
      setTimeout(() => step(i + 1), 0);
      return;
    }
    stage.renderer.setRenderTarget(null);
    sweepMs = performance.now() - sweepStart;
    const note =
      `${SWEEP_WIDTH}×${SWEEP_HEIGHT} · ${WARMUP_FRAMES} warmup + ${MEASURE_FRAMES} frames` +
      ` · shadow pass + bloom OFF · seed ${SEED} · dpr ${window.devicePixelRatio}` +
      ` · toplam ${(sweepMs / 1000).toFixed(1)} s`;
    hud.setSweep(results, note);
    console.table(
      results.map((r) => ({
        path: r.name,
        p50: +r.cpuP50.toFixed(3),
        p95: +r.cpuP95.toFixed(3),
        glCalls: r.drawCalls,
        triangles: r.triangles,
        nodes: r.sceneNodes,
      })),
    );
    busy = false;
    hud.setBusy(null);
    setPath(restore);
    onDone?.(results);
  };
  setTimeout(() => step(0), 0);
}

// --- G: props-only GL çağrı probe'u ---
function runProbe(onDone?: (rows: ProbeRow[]) => void): void {
  if (busy) return;
  busy = true;
  hud.setBusy("GL PROBE…");
  setTimeout(() => {
    const rows = probeDrawCalls(
      PATHS.map((p) => ({
        name: p.name,
        vertexColors: p.vertexColors,
        make: (m: THREE.Material) => p.make(m),
        release: releaseRoot,
      })),
    );
    const note =
      `ayrı 1×1 renderer · yalnızca prop kökü · ortografik kutu (eleme yok)` +
      ` · WEBGL_multi_draw: ${rows[0]?.multiDraw ? "YES" : "NO"}`;
    hud.setProbe(rows, note);
    console.table(rows);
    busy = false;
    hud.setBusy(null);
    onDone?.(rows);
  }, 0);
}

// --- C: BatchedMesh per-object eleme ---
function toggleCulling(): void {
  batchedCulling = !batchedCulling;
  if (root) applyBatchedFlags(root);
  hud.setFlags(hasMultiDraw, cullingFlag());
}

// --- Raycast ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = { x: 0, y: 0 };

canvas.addEventListener("pointerdown", (e) => {
  downAt = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("pointerup", (e) => {
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return; // sürükleme, tık değil
  if (!root || busy) return;
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, stage.camera);
  const hits = raycaster.intersectObject(root, true);
  if (hits.length === 0) {
    hud.setPick("MISS");
    console.log("[pick] MISS");
    return;
  }
  const h = hits[0] as THREE.Intersection & { batchId?: number };
  const id =
    h.instanceId !== undefined
      ? `instanceId ${h.instanceId}`
      : h.batchId !== undefined
        ? `batchId ${h.batchId}`
        : `faceIndex ${h.faceIndex} · HANGİ PROP BİLİNMİYOR`;
  const text = `${PATHS[pathIndex].name} → ${id} · ${h.distance.toFixed(2)} m`;
  hud.setPick(text);
  console.log(`[pick] ${text}`, h);
});

// --- Klavye ---
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k >= "1" && k <= "4") {
    if (!busy) setPath(Number(k) - 1);
  } else if (k === "m") {
    runSweep();
  } else if (k === "g") {
    runProbe();
  } else if (k === "c") {
    toggleCulling();
  } else if (k === "p") {
    autoOrbit = !autoOrbit;
    controls.enabled = !autoOrbit;
    if (!autoOrbit) {
      controls.target.set(0, 2, 0);
      controls.update();
    }
  }
});

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  stage.camera.aspect = w / h;
  stage.camera.updateProjectionMatrix();
  stage.renderer.setSize(w, h);
  postfx.resize(w, h);
});

// Açılış yolu ?path=1..4 ile seçilebilir; ekran görüntüsü ve hata ayıklama için.
const wantedPath = Number(new URLSearchParams(location.search).get("path") ?? 1);
setPath(Number.isFinite(wantedPath) ? Math.min(4, Math.max(1, wantedPath)) - 1 : 0);
tick();

console.log(
  `${TYPES} tip × ${PER_TYPE} kopya = ${placements.length} prop · tohum ${SEED}` +
    ` · three ${THREE.REVISION} · WEBGL_multi_draw: ${hasMultiDraw ? "var" : "YOK"}`,
);

// --- Ölçüm modu: ?bench=1 ---
// Demo bu parametreyle açılırsa probe + süpürme kendiliğinden koşar ve sonucu
// vite eklentisine POST eder (bench-result.json). Makaledeki CPU tablosu bu
// çıktıdan doluyor; normal açılışta bu blok hiç çalışmaz.
if (new URLSearchParams(location.search).get("bench") === "1") {
  const gl = stage.renderer.getContext();
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const payload: Record<string, unknown> = {
    gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown",
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : "unknown",
    multiDraw: hasMultiDraw,
    crossOriginIsolated: window.crossOriginIsolated, // false ise saat 100 µs'ye yuvarlanır
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    sweep: {
      width: SWEEP_WIDTH,
      height: SWEEP_HEIGHT,
      warmup: WARMUP_FRAMES,
      frames: MEASURE_FRAMES,
    },
    plan: { types: TYPES, perType: PER_TYPE, seed: SEED, props: placements.length },
  };
  setTimeout(() => {
    runProbe((rows) => {
      payload.probe = rows;
      runSweep((results) => {
        payload.results = results;
        payload.sweepMs = sweepMs;
        payload.memory = PATHS.map((p) => {
          const local = p.make(materialFor(p));
          const mem = memoryReport(local);
          releaseRoot(local);
          return { name: p.name, ...mem, propDraw: p.propDraw };
        });
        // Süpürme bittikten sonra 1,5 s canlı döngü: post-process zinciri dahil
        // GERÇEK kare süresi. Süpürme sayıları buna eşit değil (o hedefte bloom
        // ve gölge kapalıydı); ikisini ayrı raporluyoruz.
        setTimeout(() => {
          const v = timer.values();
          payload.live = {
            path: PATHS[pathIndex].name,
            frames: v.length,
            p50: p50(v),
            p95: p95(v),
            calls: stage.renderer.info.render.calls,
            triangles: stage.renderer.info.render.triangles,
          };
          void fetch("/__bench", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload, null, 2),
          }).then(() => console.log("[bench] sonuç POST edildi"));
        }, 1500);
      });
    });
  }, 800);
}
