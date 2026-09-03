// view/stage.ts — cinematic scene setup (dark cinematic + neon glow).
// PRESENTATION only: renderer/tone mapping, PBR environment (RoomEnvironment),
// shadow-casting lights, ground and prop materials. Touches none of the four build paths.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// Neon accent palette (article visual spec).
export const ACCENT = {
  cyan: 0x22d3ee,
  violet: 0xa78bfa,
  magenta: 0xf472b6,
  success: 0x34d399,
  warning: 0xfbbf24,
} as const;

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  key: THREE.DirectionalLight;
}

// Deep radial gradient background — the same tones as the CSS palette.
function makeBackgroundTexture(): THREE.Texture {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size * 0.14,
    size * 0.04,
    size / 2,
    size * 0.14,
    size * 1.15,
  );
  g.addColorStop(0.0, "#10141f");
  g.addColorStop(0.6, "#080a11");
  g.addColorStop(1.0, "#05060b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // The 1.5 ceiling is deliberate: 1,200 props + the bloom chain are not free on retina.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated in r185
  // The props don't move and the light doesn't move: draw the shadow map once per
  // BUILD, not per FRAME. On the naive path this saves 1,200 draw calls per frame —
  // it lightens the demo itself, not the measurement.
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false; // we reset the counters per frame ourselves

  const scene = new THREE.Scene();
  scene.background = makeBackgroundTexture();
  scene.fog = new THREE.FogExp2(0x080a11, 0.018);

  // Bundled RoomEnvironment → PMREM for PBR reflections (NO external HDRI).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(34, 14, 0);

  const key = new THREE.DirectionalLight(0xfff1de, 1.7);
  key.position.set(16, 26, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 90;
  const span = 32;
  key.shadow.camera.left = -span;
  key.shadow.camera.right = span;
  key.shadow.camera.top = span;
  key.shadow.camera.bottom = -span;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  scene.add(key.target);

  // Hemisphere fill — blue from the sky, dark fill from the ground.
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x0a0c16, 0.32));

  // Colored rim lights — cinematic neon edge (cyan + violet).
  const rimCyan = new THREE.DirectionalLight(ACCENT.cyan, 0.75);
  rimCyan.position.set(-18, 6, -14);
  scene.add(rimCyan);
  const rimViolet = new THREE.DirectionalLight(ACCENT.violet, 0.5);
  rimViolet.position.set(15, 4, -18);
  scene.add(rimViolet);

  return { renderer, scene, camera, key };
}

// Wide ground: receives shadows, dissolves into darkness at the edges with fog.
// A fading neon grid on top.
export function createGround(scene: THREE.Scene): void {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({
      color: 0x0a0e18,
      roughness: 0.85,
      metalness: 0.25,
      envMapIntensity: 0.5,
    }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);

  const grid = new THREE.GridHelper(104, 52, 0x2b3a5e, 0x141c30);
  grid.position.y = 0.01;
  const gm = grid.material as THREE.Material;
  gm.transparent = true;
  gm.opacity = 0.4;
  grid.renderOrder = 1;
  scene.add(grid);
}

/**
 * The prop material. Per-instance color comes from a buffer on InstancedMesh/BatchedMesh
 * and is MULTIPLIED with the base color; the base is cool and mid-toned for that reason —
 * a white base blows out the whole scene under ACES + bloom. On the merged path the same
 * color is baked into the vertices, so a second copy asking for `vertexColors: true` is needed.
 *
 * The naive path SHARES one material, so it cannot take a per-instance color: the four paths
 * have the same triangles and draw calls, but the naive scene looks single-toned. That's the price.
 */
export function createPropMaterial(vertexColors: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x8c9cc0,
    vertexColors,
    emissive: ACCENT.cyan,
    emissiveIntensity: 0.05,
    metalness: 0.45,
    roughness: 0.34,
    envMapIntensity: 0.7,
  });
}
