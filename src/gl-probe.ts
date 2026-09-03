// src/gl-probe.ts — "1 draw call" iddiasını kanıtlayan aygıt.
// Ana sahnede zemin, grid, gölge geçişi ve post-process zinciri de sayaca
// giriyor; bu yüzden yalnızca prop kökünü ayrı bir 1×1 WebGLRenderer'da bir kez
// çizip renderer.info.render.calls'ı OKUYORUZ. Sonuç: yapısal tablonun ölçülmüş
// hâli. Kamera bütün sahneyi kapsayan bir ortografik kutu, yani hiçbir şey
// eleme yüzünden düşmüyor.
import * as THREE from "three";

export interface ProbeRow {
  name: string;
  calls: number;
  triangles: number;
  multiDraw: boolean;
}

export interface ProbeBuild {
  name: string;
  /** Prop kökünü kuran fonksiyon; materyali probe kendi verir. */
  make: (material: THREE.Material) => THREE.Object3D;
  /** true ise merged yolun vertex renkleri için vertexColors gerekir. */
  vertexColors?: boolean;
  /** Kökü serbest bırakır; paylaşılan katalog geometrisine DOKUNMAZ. */
  release: (root: THREE.Object3D) => void;
}

export function probeDrawCalls(builds: ProbeBuild[]): ProbeRow[] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.info.autoReset = false;
  const multiDraw = renderer.extensions.has("WEBGL_multi_draw");

  // Sahneyi tamamen içine alan ortografik kutu: frustum eleme devrede ama
  // eleyecek bir şey yok, yani sayılan çağrı sayısı YAPISAL tavandır.
  const camera = new THREE.OrthographicCamera(-60, 60, 60, -60, 0.1, 400);
  camera.position.set(0, 40, 120);
  camera.lookAt(0, 0, 0);

  const scene = new THREE.Scene();
  const plain = new THREE.MeshBasicMaterial();
  const plainVertexColors = new THREE.MeshBasicMaterial({ vertexColors: true });

  const rows: ProbeRow[] = [];
  for (const b of builds) {
    const root = b.make(b.vertexColors ? plainVertexColors : plain);
    scene.add(root);
    renderer.info.reset();
    renderer.render(scene, camera);
    rows.push({
      name: b.name,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      multiDraw,
    });
    scene.remove(root);
    b.release(root);
  }

  plain.dispose();
  plainVertexColors.dispose();
  renderer.forceContextLoss(); // 1×1 bağlamı hemen bırak
  renderer.dispose();
  return rows;
}
