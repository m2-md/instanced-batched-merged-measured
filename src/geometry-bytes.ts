// src/geometry-bytes.ts — accounting for the buffers uploaded to the GPU. renderer.info.memory
// tells you only HOW MANY geometries/textures there are, not how many BYTES;
// the byte count comes out of the byteLength of the attribute arrays.
import * as THREE from "three";

/** Buffer size of one geometry: every attribute + the index. */
export function geometryBytes(g: THREE.BufferGeometry): number {
  let bytes = 0;
  for (const key of Object.keys(g.attributes)) {
    bytes += (g.attributes[key] as THREE.BufferAttribute).array.byteLength;
  }
  if (g.index) bytes += g.index.array.byteLength;
  return bytes;
}

/** If the same geometry is shared by two meshes it lives ONCE on the GPU: dedupe by uuid. */
export function uniqueGeometryBytes(geometries: Iterable<THREE.BufferGeometry>): number {
  const seen = new Set<string>();
  let bytes = 0;
  for (const g of geometries) {
    if (seen.has(g.uuid)) continue;
    seen.add(g.uuid);
    bytes += geometryBytes(g);
  }
  return bytes;
}

export interface MemoryReport {
  geometryBytes: number; // unique geometry buffers
  instanceBytes: number; // instance matrix/color buffers and BatchedMesh textures
  uniqueGeometries: number;
  nodes: number; // scene node count (root included)
}

// BatchedMesh keeps instance data in three DataTextures (matrix/indirect/color).
// three keeps them private, but the byte count needs to read them; if a field is
// missing we skip it silently.
interface BatchedTextures {
  _matricesTexture?: THREE.DataTexture | null;
  _indirectTexture?: THREE.DataTexture | null;
  _colorsTexture?: THREE.DataTexture | null;
}

function dataTextureBytes(tex: THREE.DataTexture | null | undefined): number {
  const data = tex?.image?.data as ArrayBufferView | undefined;
  return data ? data.byteLength : 0;
}

/** The GPU buffer bill of a scene root. Weighs the four build paths on the same scale. */
export function memoryReport(root: THREE.Object3D): MemoryReport {
  const geometries: THREE.BufferGeometry[] = [];
  let instanceBytes = 0;
  let nodes = 0;

  root.traverse((o) => {
    nodes++;
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geometries.push(mesh.geometry);

    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      instanceBytes += inst.instanceMatrix.array.byteLength;
      if (inst.instanceColor) instanceBytes += inst.instanceColor.array.byteLength;
    }

    const batched = o as THREE.BatchedMesh & BatchedTextures;
    if (batched.isBatchedMesh) {
      instanceBytes += dataTextureBytes(batched._matricesTexture);
      instanceBytes += dataTextureBytes(batched._indirectTexture);
      instanceBytes += dataTextureBytes(batched._colorsTexture);
    }
  });

  const seen = new Set<string>();
  for (const g of geometries) seen.add(g.uuid);

  return {
    geometryBytes: uniqueGeometryBytes(geometries),
    instanceBytes,
    uniqueGeometries: seen.size,
    nodes,
  };
}

/** 81708 → "79.8 KB". 1 KB = 1024 B. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
