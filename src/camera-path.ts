// src/camera-path.ts
import * as THREE from "three";

/** Kare indeksine bağlı, deterministik yörünge. Aynı frame → aynı poz. */
export function cameraPose(
  frame: number,
  totalFrames: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const t = frame / totalFrames;
  const angle = t * Math.PI * 2;
  return target.set(Math.cos(angle) * 34, 13 + Math.sin(angle * 2) * 4, Math.sin(angle) * 34);
}
