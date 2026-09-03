// view/postfx.ts — EffectComposer + UnrealBloomPass (neon glow). Bundled
// three/examples modülleri; harici bağımlılık yok. Zincir bilerek kısa: bloom
// yarım çözünürlükte koşar, çünkü sahnede 1.200 prop var ve amaç CPU tarafını
// ölçmek — GPU'yu post-process'le doldurmak değil.
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

  // OutputPass: ACES tone mapping + sRGB dönüşümü zincirin sonunda uygulanır.
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
