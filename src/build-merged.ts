// src/build-merged.ts
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CatalogEntry } from "./catalog.js";
import { placementMatrix, type Placement } from "./level-plan.js";

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * Her yerleşim için geometriyi KOPYALA, dünya matrisini uygula, hepsini birleştir.
 * Renk artık örnek başına değil VERTEX başına: material.vertexColors = true gerekir.
 */
export function buildMerged(
  catalog: CatalogEntry[],
  placements: Placement[],
  material: THREE.Material,
): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];

  for (const p of placements) {
    const g = catalog[p.typeIndex].geometry.clone();
    g.applyMatrix4(placementMatrix(p, _m)); // transform geometriye PİŞİYOR

    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    _c.setHSL(p.hue, 0.45, 0.55);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  }

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose(); // kopyalar işini bitirdi
  if (!merged) throw new Error("mergeGeometries: attribute setleri uyuşmuyor");

  merged.computeBoundingSphere();
  return new THREE.Mesh(merged, material);
}
