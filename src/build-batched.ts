// src/build-batched.ts
import * as THREE from "three";
import type { CatalogEntry } from "./catalog.js";
import { placementMatrix, type Placement } from "./level-plan.js";

export interface BatchCapacity {
  maxInstanceCount: number;
  maxVertexCount: number;
  maxIndexCount: number;
  geometryCount: number;
}

/** Budget: as many instances as placements, as many vertices/indices as the UNIQUE geometry total. */
export function planBatchCapacity(catalog: CatalogEntry[], placements: Placement[]): BatchCapacity {
  const used = new Set(placements.map((p) => p.typeIndex));
  let maxVertexCount = 0;
  let maxIndexCount = 0;
  for (const t of used) {
    const g = catalog[t].geometry;
    maxVertexCount += g.attributes.position.count;
    maxIndexCount += g.index!.count;
  }
  return {
    maxInstanceCount: placements.length,
    maxVertexCount,
    maxIndexCount,
    geometryCount: used.size,
  };
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** 40 distinct geometries + 1200 instances → a single BatchedMesh, a single draw call. */
export function buildBatched(
  catalog: CatalogEntry[],
  placements: Placement[],
  material: THREE.Material,
): THREE.BatchedMesh {
  const cap = planBatchCapacity(catalog, placements);
  const mesh = new THREE.BatchedMesh(
    cap.maxInstanceCount,
    cap.maxVertexCount,
    cap.maxIndexCount,
    material,
  );

  // Phase 1: every unique geometry enters the buffer ONCE.
  const geometryIds = new Map<number, number>();
  const usedTypes = [...new Set(placements.map((p) => p.typeIndex))].sort((a, b) => a - b);
  for (const t of usedTypes) {
    geometryIds.set(t, mesh.addGeometry(catalog[t].geometry));
  }

  // Phase 2: instances are added as a reference to a geometryId, and get their transform after.
  for (const p of placements) {
    const instanceId = mesh.addInstance(geometryIds.get(p.typeIndex)!);
    placementMatrix(p, _m);
    mesh.setMatrixAt(instanceId, _m);
    mesh.setColorAt(instanceId, _c.setHSL(p.hue, 0.45, 0.55));
  }

  mesh.computeBoundingSphere();
  return mesh;
}
