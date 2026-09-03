// view/postfx.ts — EffectComposer + UnrealBloomPass (neon glow). Bundled
// three/examples modules; no external dependency. The chain is deliberately short:
// bloom runs at half resolution, because the scene has 1,200 props and the goal is
// to measure the CPU side — not to fill the GPU with post-processing.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface PostFx {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  resize(w: number, h: number): void;
}

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5),
    0.42,
    0.55,
    0.92,
  );
  composer.addPass(bloom);

  // OutputPass: ACES tone mapping + sRGB conversion applied at the end of the chain.
  composer.addPass(new OutputPass());

  return {
    composer,
    bloom,
    resize(w: number, h: number): void {
      composer.setSize(w, h);
      bloom.setSize(w * 0.5, h * 0.5);
    },
  };
}
