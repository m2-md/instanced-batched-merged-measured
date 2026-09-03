// src/catalog.ts
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface CatalogEntry {
  name: string;
  geometry: THREE.BufferGeometry;
}

// prettier-ignore
const FAMILIES = [
  { kind: "crate",   make: (s: number) => new THREE.BoxGeometry(0.7 + s * 0.18, 0.7 + s * 0.12, 0.7 + s * 0.15) },
  { kind: "barrel",  make: (s: number) => new THREE.CylinderGeometry(0.32 + s * 0.05, 0.36 + s * 0.05, 0.9 + s * 0.12, 10) },
  // IcosahedronGeometry index'siz doğar; mergeVertices onu indexed hâle getirir.
  // Neden şart olduğunu Yol 2'de göreceğiz — BatchedMesh bu konuda taviz vermiyor.
  { kind: "rock",    make: (s: number) => mergeVertices(new THREE.IcosahedronGeometry(0.35 + s * 0.12, s < 3 ? 0 : 1)) },
  { kind: "plant",   make: (s: number) => new THREE.ConeGeometry(0.28 + s * 0.06, 0.8 + s * 0.2, 7) },
  { kind: "lantern", make: (s: number) => new THREE.SphereGeometry(0.26 + s * 0.05, 9, 7) },
  { kind: "beam",    make: (s: number) => new THREE.BoxGeometry(0.18, 1.4 + s * 0.35, 0.18) },
  { kind: "ring",    make: (s: number) => new THREE.TorusGeometry(0.34 + s * 0.06, 0.1, 6, 12) },
  { kind: "shard",   make: (s: number) => mergeVertices(new THREE.DodecahedronGeometry(0.3 + s * 0.08)) },
];

/** 8 aile × 5 boy = 40 prop tipi. Sıra sabit; typeIndex bu sıradaki konumdur. */
export function buildCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const f of FAMILIES) {
    for (let s = 0; s < 5; s++) {
      const geometry = f.make(s);
      geometry.name = `${f.kind}-${s}`;
      out.push({ name: geometry.name, geometry });
    }
  }
  return out;
}
