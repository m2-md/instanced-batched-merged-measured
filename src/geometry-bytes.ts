// src/geometry-bytes.ts — GPU'ya yüklenen tampon muhasebesi. renderer.info.memory
// sana yalnızca KAÇ geometri/doku olduğunu söyler, kaç BAYT olduğunu söylemez;
// bayt hesabı attribute dizilerinin byteLength'lerinden çıkar.
import * as THREE from "three";

/** Bir geometrinin tampon boyutu: bütün attribute'lar + index. */
export function geometryBytes(g: THREE.BufferGeometry): number {
  let bytes = 0;
  for (const key of Object.keys(g.attributes)) {
    bytes += (g.attributes[key] as THREE.BufferAttribute).array.byteLength;
  }
  if (g.index) bytes += g.index.array.byteLength;
  return bytes;
}

/** Aynı geometri iki mesh'te paylaşılıyorsa GPU'da BİR kez durur: uuid ile tekille. */
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
  geometryBytes: number; // benzersiz geometri tamponları
  instanceBytes: number; // instance matris/renk tamponları ve BatchedMesh dokuları
  uniqueGeometries: number;
  nodes: number; // sahne düğümü sayısı (kök dahil)
}

// BatchedMesh instance verisini üç DataTexture'da tutar (matris/indirect/renk).
// three bunları private tutuyor, ama bayt hesabı için okumak gerekiyor; alan
// yoksa sessizce atlıyoruz.
interface BatchedTextures {
  _matricesTexture?: THREE.DataTexture | null;
  _indirectTexture?: THREE.DataTexture | null;
  _colorsTexture?: THREE.DataTexture | null;
}

function dataTextureBytes(tex: THREE.DataTexture | null | undefined): number {
  const data = tex?.image?.data as ArrayBufferView | undefined;
  return data ? data.byteLength : 0;
}

/** Bir sahne kökünün GPU tampon faturası. Dört inşa yolunu aynı terazide tartar. */
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

/** 81708 → "79,8 KB". Türkçe ondalık ayırıcı, 1 KB = 1024 B. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(".", ",")} KB`;
  return `${(kb / 1024).toFixed(2).replace(".", ",")} MB`;
}
