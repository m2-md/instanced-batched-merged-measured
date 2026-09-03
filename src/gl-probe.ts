// src/gl-probe.ts — the instrument that proves the "1 draw call" claim.
// In the main scene the ground, the grid, the shadow pass and the post-process
// chain also enter the counter; that is why we draw ONLY the prop root once in a
// separate 1×1 WebGLRenderer and READ renderer.info.render.calls. The result: the
// measured version of the structural table. The camera is an orthographic box that
// covers the whole scene, so nothing drops out because of culling.
import * as THREE from "three";

export interface ProbeRow {
  name: string;
  calls: number;
  triangles: number;
  multiDraw: boolean;
}

export interface ProbeBuild {
  name: string;
  /** The function that builds the prop root; the probe supplies the material itself. */
  make: (material: THREE.Material) => THREE.Object3D;
  /** If true, the merged path's vertex colors need vertexColors. */
  vertexColors?: boolean;
  /** Releases the root; does NOT touch the shared catalog geometry. */
  release: (root: THREE.Object3D) => void;
}

export function probeDrawCalls(builds: ProbeBuild[]): ProbeRow[] {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.info.autoReset = false;
  const multiDraw = renderer.extensions.has("WEBGL_multi_draw");

  // An orthographic box that fully contains the scene: frustum culling is on but
  // there is nothing to cull, so the call count is the STRUCTURAL ceiling.
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
  renderer.forceContextLoss(); // drop the 1×1 context right away
  renderer.dispose();
  return rows;
}
