# InstancedMesh mi, BatchedMesh mi, mergeGeometries mi? Aynı Sahne, Üç İnşa Yolu, Ölçülmüş Bir Karar Tablosu

*"Draw call'ı azalt" tavsiyesini herkes biliyor. Kimse hangi yolla azaltacağını söylemiyor. Three.js'te üç yol var — `InstancedMesh`, `BatchedMesh`, `mergeGeometries` — ve üçü de sana aynı sayıyı düşürürken farklı bir şeyini alıyor. Bu yazıda aynı sahneyi (40 prop tipi, 1200 örnek) o üç yolla ve bir de naif hâliyle kurup dördünü de ölçüyoruz: draw call, GPU'daki geometri, VRAM, kurulum süresi, esneklik. Sonunda dürüst bir karar tablosu var — her satırında neyi feda ettiğin yazıyor.*

*Tahmini okuma süresi: 17 dakika*

---

Bir seviyeye dekor dolduruyordum. Sandık, varil, taş, bitki, fener, direk, halka, kristal — sekiz aile, her aileden beş boy, toplam kırk prop tipi. Her tipten otuz kopya serpip zemini kalabalıklaştırdım. Toplam bin iki yüz nesne; 3D için mütevazı bir sayı, hiçbir modern GPU'yu terletmez.

Sonra sayaca baktım.

```js
// giriş örneği — bu sayıyı projede src/gl-probe.ts izole bir 1×1 renderer'da okuyor
console.log(renderer.info.render.calls); // 1200 — prop başına bir tane
```

Bin iki yüz çizim çağrısı (draw call). Üçgen sayısı altmış bir bin küsur — GPU'nun yapacağı iş gülünecek kadar az. Ama CPU, o altmış bir bin üçgeni GPU'ya anlatmak için bin iki yüz kez ayrı ayrı sipariş fişi yazıyordu. Fişlerin hepsi de aynı materyale bakıyordu; değişen tek şey kırk geometriydi.

Buraya kadar herkesin bildiği hikâye. Bundan sonrası herkesin atladığı kısım: bu israfı kesmenin üç ayrı yolu var ve üçü aynı şey değil.

Kargo gibi düşün. Draw call bir kamyon seferi. Naif kurulum her sandık için ayrı bir sefer düzenler. `InstancedMesh` aynı üründen olanları tek kamyona doldurur — ama kamyona tek ürün tipi girer, otuz sandık evet, sandık artı varil hayır. `BatchedMesh` farklı ürünleri aynı kamyona koyar; şartı hepsinin aynı ambalajı (materyal) ve aynı standart paleti kullanması. `mergeGeometries` ise bütün ürünleri birbirine kaynaklayıp tek blok hâlinde gönderir: en ucuz sefer, ama depoda artık tek bir sandığı yerinden alamazsın.

Yol haritası altı durak: önce deterministik bir seviye dolgusu kurup naif hâlin faturasını sayıyla göreceğiz, sonra üç yolu sırayla inşa edeceğiz — instanced, batched, merged. Beşinci durakta dördünü aynı sahnede, aynı kamera yolunda ölçüp dürüst bir karar tablosuna dökeceğiz; altıncıda bütün inşa katmanını render'dan söküp tarayıcısız bir vitest paketine sokacağız.

Geçen yazıda on bin Rapier gövdesini tek bir `InstancedMesh`'e sürmüştük — orada mesele *her karede değişen* transform'ları tampona yazmaktı. Bu yazı onun tersi: transform'lar hiç değişmiyor, prop'lar duruyor. Değişen şey, sahneyi hangi kaptan inşa ettiğin. İlk yazıdaki `FrameTimer` ile p50/p95 disiplinini de aynen buraya taşıyacağız, çünkü "hangisi daha hızlı" sorusunun cevabı ortalamada değil, yüzdeliklerde saklı.

### Sahne: 40 Tip, 1200 Örnek, Tek Tohum

Dört yolu karşılaştırmanın ön koşulu, dördünün de birebir aynı sahneyi kurması. Bunu garanti etmenin en ucuz yolu tohumlu (seeded) bir üreteç: sahne bir veri yapısı olarak bir kez planlanır, dört inşa fonksiyonu aynı plandan beslenir. Üreteç serideki tanıdık `mulberry32`:

```ts
// src/rng.ts
/** 32-bit tohumlu, hızlı ve deterministik üreteç. Aynı tohum → aynı dizi. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Şimdi katalog. Sekiz prop ailesi, her birinin beş boy varyantı; hepsi three'nin hazır primitive'lerinden, hepsi düşük poligonlu:

```ts
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
```

Bu kırk geometrinin toplamı 2.169 vertex ve 6.150 index. Aklında tut; birazdan iki kez lazım olacak.

Yerleşim planı düz bir veri dizisi. Transform'u burada matris olarak değil, ham parametre olarak tutuyorum — çünkü dört inşa yolunun üçü matrisi kendi tamponuna yazacak, biri ise `Object3D` alanlarına dağıtacak:

```ts
// src/level-plan.ts
import * as THREE from "three";
import { mulberry32 } from "./rng.js";

export interface Placement {
  typeIndex: number; // katalogdaki tip (0..39)
  x: number;
  z: number;
  rotY: number;
  scale: number;
  hue: number; // 0..1, örnek başına renk için
}

/** typeCount tipin her birinden perType kopya; tohum aynıysa sonuç aynı. */
export function planLevel(typeCount: number, perType: number, seed: number): Placement[] {
  const rng = mulberry32(seed);
  const out: Placement[] = [];
  const half = 26;
  for (let t = 0; t < typeCount; t++) {
    for (let k = 0; k < perType; k++) {
      out.push({
        typeIndex: t,
        x: (rng() * 2 - 1) * half,
        z: (rng() * 2 - 1) * half,
        rotY: rng() * Math.PI * 2,
        scale: 0.75 + rng() * 0.8,
        hue: rng(),
      });
    }
  }
  // Deterministik Fisher-Yates: tipler sahneye karışık gelsin, gruplama işi
  // inşa fonksiyonuna kalsın. Gerçek bir seviye editörü de sıralı vermez.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** Yerleşimi 4x4 matrise derler. Scratch'ler döngü dışında: kare başına sıfır ayırma. */
export function placementMatrix(p: Placement, target: THREE.Matrix4): THREE.Matrix4 {
  _p.set(p.x, p.scale * 0.5, p.z);
  _q.setFromAxisAngle(UP, p.rotY);
  _s.setScalar(p.scale);
  return target.compose(_p, _q, _s);
}
```

`placementMatrix`'in modül seviyesinde tuttuğu üç scratch, Rapier yazısındaki "tek kalem" fikrinin aynısı. Orada her karede on bin kez çağırıyorduk; burada kurulumda bin iki yüz kez. Alışkanlık ucuz, bırakmaya gerek yok.

Naif inşa şimdi tek paragraf:

```ts
// src/build-naive.ts
import * as THREE from "three";
import type { CatalogEntry } from "./catalog.js";
import type { Placement } from "./level-plan.js";

const UP = new THREE.Vector3(0, 1, 0);

/** Yerleşim başına bir THREE.Mesh. Geometri ve materyal PAYLAŞILIR; ayrı olan sadece düğüm. */
export function buildNaive(
  catalog: CatalogEntry[],
  placements: Placement[],
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  for (const p of placements) {
    const mesh = new THREE.Mesh(catalog[p.typeIndex].geometry, material);
    mesh.position.set(p.x, p.scale * 0.5, p.z);
    mesh.quaternion.setFromAxisAngle(UP, p.rotY);
    mesh.scale.setScalar(p.scale);
    group.add(mesh);
  }
  return group;
}
```

Küçük bir not, çünkü bu yazının dürüstlük çizgisi buradan geçiyor: naif yolda bile geometri ve materyal paylaşılıyor. Bin iki yüz `Mesh`, kırk geometriye ve tek materyale işaret ediyor. GPU'da fazladan tek bayt yer kaplamıyorlar. Naif yolun bedeli bellek değil; her prop için ayrı bir sipariş fişi ve ayrı bir sahne düğümü.

Paylaşımın görünür bir yan etkisi var, demoda hemen fark ediliyor: tek materyali paylaşan naif yol örnek başına renk alamıyor, sahne tek tonda duruyor. Diğer üç yol rengi tampondan (instance/vertex) alıyor. Renk vermek için mesh başına materyal açsan paylaşım biter ve karşılaştırma bozulur — o yüzden naif yolu tek tonda bıraktım.

### Yol 1 — InstancedMesh: Tip Başına Bir Sefer

`InstancedMesh` bir geometri, bir materyal ve N tane instance matrisini bir arada tutar. GPU'ya "şu geometriyi şu matrislerin her biriyle bir kerede çiz" der. Kısıt tek cümle: bir `InstancedMesh` içinde geometri tektir. Kırk farklı prop tipin varsa kırk `InstancedMesh` kurarsın.

Planı tipe göre gruplayıp her grup için bir mesh:

```ts
// src/build-instanced.ts
import * as THREE from "three";
import type { CatalogEntry } from "./catalog.js";
import { placementMatrix, type Placement } from "./level-plan.js";

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** Prop TİPİ başına bir InstancedMesh. 40 tip → 40 çizim çağrısı. */
export function buildInstanced(
  catalog: CatalogEntry[],
  placements: Placement[],
  material: THREE.Material,
): THREE.Group {
  const byType = new Map<number, Placement[]>();
  for (const p of placements) {
    let list = byType.get(p.typeIndex);
    if (!list) {
      list = [];
      byType.set(p.typeIndex, list);
    }
    list.push(p);
  }

  const group = new THREE.Group();
  for (const [typeIndex, list] of byType) {
    const mesh = new THREE.InstancedMesh(catalog[typeIndex].geometry, material, list.length);
    for (let i = 0; i < list.length; i++) {
      placementMatrix(list[i], _m);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.setHSL(list[i].hue, 0.45, 0.55));
    }
    mesh.instanceMatrix.needsUpdate = true;
    // instanceColor ilk setColorAt çağrısında doğar; öncesinde null'dır.
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
```

Rapier yazısından bir fark var, altını çizmeye değer: orada `instanceMatrix.setUsage(THREE.DynamicDrawUsage)` diyorduk çünkü tampon her kare yeniden yükleniyordu. Burada prop'lar kımıldamıyor. Varsayılan `StaticDrawUsage` tam da doğru olan; sürücüye "bunu bir kez yükle ve unut" demek istiyoruz.

Sayı 1.200'den 40'a indi. Otuz kat. Bunun için ödediğin bedel neredeyse sıfır: aynı geometriler, aynı materyal, ekstra olarak instance başına bir matris (64 bayt) ve bir renk (12 bayt). Bin iki yüz örnek için toplam 89 KB tampon. Ucuz.

Peki neden durup burada kalmıyoruz? İki sebep var.

Birincisi kırk hâlâ kırk. Prop çeşitliliğin yüze çıkarsa yüz çizim çağrın olur; instancing sana tip sayısınca bir taban veriyor, ondan aşağı inemiyorsun.

İkincisi daha sinsi: frustum culling (görüş piramidi eleme) artık `InstancedMesh` başına çalışıyor. Bir tipin otuz kopyası haritanın dört bir yanına serpilmişse o mesh'in bounding sphere'i (sınırlayıcı küre) bütün haritayı kapsar; kamera nereye bakarsa baksın o mesh elenmez. Naif yolda ekran dışındaki prop bedavaydı. Instanced yolda hâlâ tamponun içinde ve vertex shader onu hâlâ işliyor.

Bu, geçen yazıdaki bayat küre tuzağının kardeşi: orada küre bayatlıyordu, burada küre baştan doğru ama işe yaramayacak kadar geniş. İkisinin ortak dersi aynı: instancing'e geçtiğin anda culling'in çözünürlüğünü kaybediyorsun.

### Yol 2 — BatchedMesh: Farklı Geometriler, Tek Sefer

`BatchedMesh` three'ye r156'da girdi ve tam olarak instancing'in bırakamadığı yerden tutuyor: aynı materyalle **farklı** geometrileri tek çizim çağrısında toplar. Altında `WEBGL_multi_draw` uzantısı var — GPU'ya tek komutla "şu tamponun şu aralıklarını şu sırayla çiz" dersin.

Kurulumun ilk adımı kapasite planlaması. İşin en zarif kısmı da tam burada ortaya çıkıyor: `BatchedMesh` kurucusu üç bütçe ister — kaç örnek, kaç vertex, kaç index.

```ts
// three.js BatchedMesh kurucu imzası (BatchedMesh.d.ts alıntısı) — bu projede tanımlı DEĞİL
constructor(maxInstanceCount: number, maxVertexCount: number, maxIndexCount?: number, material?: Material)
```

Vertex bütçesi örnek sayısına göre değil, **benzersiz geometri** sayısına göre hesaplanır. Bin iki yüz prop koyacak olmana rağmen tamponda kırk geometrinin toplamı kadar yer ayırırsın:

```ts
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

/** Bütçe: örnek sayısı kadar instance, BENZERSİZ geometri toplamı kadar vertex/index. */
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
```

Bizim sahnede bu fonksiyon `{ maxInstanceCount: 1200, maxVertexCount: 2169, maxIndexCount: 6150, geometryCount: 40 }` döndürüyor. İki bin yüz altmış dokuz vertex — yukarıda aklında tutmanı istediğim sayı. Bin iki yüz prop, iki bin küsur vertex'lik bir tamponla çiziliyor, çünkü her geometri GPU'da bir kez duruyor.

İnşa iki fazlı: önce geometriler tamponu doldurur ve birer `geometryId` alır, sonra örnekler o id'lere referansla eklenir:

```ts
// src/build-batched.ts (devamı)
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** 40 farklı geometri + 1200 örnek → tek BatchedMesh, tek çizim çağrısı. */
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

  // Faz 1: her benzersiz geometri tampona BİR kez girer.
  const geometryIds = new Map<number, number>();
  const usedTypes = [...new Set(placements.map((p) => p.typeIndex))].sort((a, b) => a - b);
  for (const t of usedTypes) {
    geometryIds.set(t, mesh.addGeometry(catalog[t].geometry));
  }

  // Faz 2: örnekler bir geometryId'ye referansla eklenir, transform'u sonra alır.
  for (const p of placements) {
    const instanceId = mesh.addInstance(geometryIds.get(p.typeIndex)!);
    placementMatrix(p, _m);
    mesh.setMatrixAt(instanceId, _m);
    mesh.setColorAt(instanceId, _c.setHSL(p.hue, 0.45, 0.55));
  }

  mesh.computeBoundingSphere();
  return mesh;
}
```

Kırk tip, bin iki yüz örnek, tek çizim çağrısı. Kargo metaforunun tam karşılığı: farklı ürünler aynı kamyonda, her koli kendi adresiyle.

Ama `BatchedMesh` disiplinli bir kamyon şoförü. Yüklemeyi kabul etmesi için üç şart var ve üçünü de kodu yazarken sırayla yedim.

Birincisi index tutarlılığı. Bütün geometrilerin ya hepsi indexed olacak ya hiçbiri. Karıştırırsan net bir hata alırsın:

```
THREE.BatchedMesh: All geometries must consistently have "index".
```

`IcosahedronGeometry` ve `DodecahedronGeometry` — genel olarak `PolyhedronGeometry` soyundan gelen her şey — index'siz doğar. `BoxGeometry`, `SphereGeometry`, `CylinderGeometry` ise indexed. Katalogda taşları ve kristalleri `mergeVertices()`'ten geçirmemin sebebi bu. `mergeVertices` konum + normal + uv üçlüsü aynı olan vertex'leri birleştirip index tamponu üretir; flat-shaded bir taşın köşe normalleri farklı olduğu için görüntü bozulmaz, sadece geometri indexlenir.

İkincisi attribute tutarlılığı. Bütün geometrilerin aynı attribute setine sahip olması gerekir:

```
THREE.BatchedMesh: Added geometry missing "uv". All geometries must have consistent attributes.
```

Bir prop'un uv'sini optimizasyon diye silmişsen bütün batch çöker. Bizim katalogda kırk geometrinin hepsi `position/normal/uv` taşıyor; bu bir tesadüf değil, sözleşme — ve birazdan test edeceğiz.

Üçüncüsü bütçe. `addGeometry` ayırdığın vertex/index alanını aşarsa, `addInstance` ise `maxInstanceCount`'u aşarsa atar:

```
THREE.BatchedMesh: Reserved space request exceeds the maximum buffer size.
THREE.BatchedMesh: Maximum item count reached.
```

Bu yüzden bütçeyi elle "1000 olsun herhâlde yeter" diye yazmak yerine katalogdan hesaplıyoruz. Sahne büyürse hesap kendiliğinden büyür.

Gelelim `BatchedMesh`'in bedavaya verdiği şeye, çünkü instancing'le en büyük farkı orada: `perObjectFrustumCulled` varsayılan olarak `true`. Batch, her örneğin kendi bounding'ini biliyor ve kamera dışında kalanları multi-draw listesinden çıkarıyor. Çizim çağrısı yine bir, ama gönderilen üçgen sayısı kadrajla birlikte iniyor. `InstancedMesh`'te olmayan şey tam olarak buydu.

```ts
// BatchedMesh varsayılanları — API turu; projede bu ikili src/main.ts'te C tuşuyla çevriliyor
mesh.perObjectFrustumCulled = true; // varsayılan; örnek başına eleme
mesh.sortObjects = true;            // varsayılan; opak materyalde ön-arka sıralama
```

`sortObjects` ise her karede örnekleri derinliğe göre sıralar — opak materyalde overdraw'ı azaltmak için önden arkaya, transparan materyalde arkadan öne. İkisi de bedava değil: bin iki yüz örnekte eleme + sıralama kare başına 0,24 ms tutuyor, ölçüm bölümünde bu sayıyı ayrı çıkaracağız. Yüz binde `setCustomSort()` ile kendi sıralamanı vermek gerekir.

Bir de silme ve gizleme var, ki merged yolda hiç olmayacak:

```ts
// BatchedMesh API turu — bu üç çağrı projede KULLANILMIYOR, yetenek göstergesi
mesh.setVisibleAt(instanceId, false); // örneği çizme, yerini koru
mesh.deleteInstance(instanceId);      // örneği tamamen çıkar
mesh.setGeometryIdAt(instanceId, otherGeometryId); // çalışırken tip değiştir
```

Son bir dürüstlük notu: "tek çizim çağrısı" iddiası `WEBGL_multi_draw` uzantısına bağlı. Uzantı yoksa three geri düşüyor ve `BatchedMesh`'i bir döngüde tek tek çiziyor — sayaç yeniden örnek sayısına yaklaşıyor. Uzantı masaüstü Chrome ve Firefox'ta yaygın, ama garantili değil. Demoda uzantının varlığını HUD'a yazıyorum, çünkü "1 draw call" gördüğünü sandığın yerde 1.200 görüyor olabilirsin.

### Yol 3 — mergeGeometries: Tek Blok, Geri Dönüşü Yok

Üçüncü yol en eski ve en kaba olanı: bütün prop'ların geometrisini dünya uzayına taşıyıp tek bir dev `BufferGeometry`'de birleştirmek. Sonuç tek bir `Mesh`, tek bir çizim çağrısı ve sahne grafiğinde tek bir düğüm.

```ts
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
```

İki satır bu yolun bütün karakterini anlatıyor. `g.clone()` — her örnek için geometrinin ayrı bir kopyası çıkıyor. `g.applyMatrix4(...)` — transform artık bir matris değil, vertex konumlarının kendisi. Kaynak yapıldı.

`mergeGeometries` uyuşmayan attribute setinde hata atmaz, `null` döndürür ve konsola yazar. Bu yüzden dönüşü kontrol etmek şart; sessizce `null`'la devam edip on dakika sonra "sahne neden boş" diye aramak istemezsin.

Faturaya bakalım. Katalog 2.169 vertex tutuyordu. Birleştirilmiş geometri:

```
merged verts:  65.070   (= 40 tipin toplamı × 30 kopya)
merged index:  184.500
merged bytes:  3.232.080  ≈ 3,08 MB
```

Aynı sahne, aynı görüntü. `BatchedMesh` bunu 79,8 KB'lık bir geometri tamponuyla çiziyordu; merged yol 3,08 MB istiyor. Otuz dokuz buçuk kat. Sebep basit: batch her geometriyi bir kez saklayıp örnekleri matrisle çoğaltır, merge her örneği ayrı ayrı vertex olarak yazar.

Vertex renkleri de bu faturanın parçası. Örnek başına renk `InstancedMesh`'te 12 bayt tutuyordu (1200 × 12 = 14 KB); merged yolda renk vertex başına yazılmak zorunda: 65.070 × 12 = 780.840 bayt, yani 762 KB. Aynı bilgi, elli dört kat yer.

Ama asıl kayıp bellek değil. Kaybettiklerin sırayla:

Tekil hareket gitti. Bir varili yerinden oynatmak için ya bütün geometriyi yeniden birleştirmen ya da o varilin vertex'lerini elle bulup tek tek taşıman gerek. İkisi de kare içinde yapılacak iş değil.

Frustum culling gitti. Sahnede tek bir nesne var ve bounding sphere'i bütün haritayı kapsıyor. Kamera bir köşeye baksa bile altmış bir bin üçgenin tamamı vertex shader'dan geçiyor. `BatchedMesh` burada per-object eleme yapıyordu; merged yolda elenecek "object" yok.

Picking gitti. Kayıpların en somutu bu, çünkü tek satırla gösterilebiliyor:

```ts
// src/main.ts (parça) — altındaki üç satır yorum, kodun kendisi değil
const hits = raycaster.intersectObject(root, true);
// InstancedMesh  → hits[0].instanceId  (hangi örnek)
// BatchedMesh    → hits[0].batchId     (hangi örnek)
// merged Mesh    → hits[0].faceIndex   (hangi ÜÇGEN — hangi prop olduğu bilinmiyor)
```

Merged geometride ışın gerçekten çarpıyor, mesafeyi de doğru veriyor. Ama sana "3.847 numaralı üçgene çarptın" diyor. O üçgenin hangi varile ait olduğunu bilmek istiyorsan, aralıkları ayrı bir tabloda kendin tutmak ve `faceIndex`'i o tabloda aramak zorundasın. Batch bunu senin için yapıyor.

Merged yol dekoru bir heykele çeviriyor: bakması güzel, bir daha dokunamıyorsun. Doğru yerde mükemmel; yanlış yerde geri dönüşü pahalı.

### Ölçüm: Aynı Sahne, Aynı Kamera, Dört Yol

Karşılaştırmanın kuralı: tek değişken. Dördü de aynı `planLevel(40, 30, 1337)` çıktısını kullanıyor, aynı materyali paylaşıyor, aynı kamera pozlarından geçiyor. Kamera yolu duvar saatine değil kare indeksine bağlı — böylece dört koşum birebir aynı kareleri görüyor:

```ts
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
```

Zamanlayıcı bu serinin ilk yazısındaki `FrameTimer` ile aynı halka tampon; p50/p95 de aynı `stats` modülünden geliyor. Orada anlattığım uyarı burada da harfiyen geçerli: `performance.now()` ile ölçtüğün şey CPU'nun siparişi yazma süresidir, GPU'nun pişirme süresi değil. Bu yazıda ölçmek istediğim tam olarak o sipariş yazma süresi olduğu için CPU saati doğru alet — draw call maliyeti CPU tarafında birikir.

Süpürme kısa ve elle tetikleniyor. `M` tuşuna basınca dört yol sırayla sahneye alınır, her biri 20 kare ısınır ve 120 kare ölçülür:

```ts
// src/measure.ts
import { FrameTimer } from "./frame-timer.js";
import { p50, p95 } from "./stats.js";

export interface PathResult {
  name: string;
  cpuP50: number;
  cpuP95: number;
  drawCalls: number;
  triangles: number;
  sceneNodes: number;
}

export const WARMUP_FRAMES = 20;
export const MEASURE_FRAMES = 120;

/** Tek bir yolu ölçer. renderFrame(frameIndex) bir kare çizip döner. */
export function measurePath(
  name: string,
  renderFrame: (frame: number) => void,
  readInfo: () => { calls: number; triangles: number; nodes: number },
): PathResult {
  const timer = new FrameTimer(MEASURE_FRAMES);
  for (let f = 0; f < WARMUP_FRAMES; f++) renderFrame(f);
  for (let f = 0; f < MEASURE_FRAMES; f++) {
    timer.begin();
    renderFrame(f);
    timer.end();
  }
  const info = readInfo();
  const v = timer.values();
  return {
    name,
    cpuP50: p50(v),
    cpuP95: p95(v),
    drawCalls: info.calls,
    triangles: info.triangles,
    sceneNodes: info.nodes,
  };
}
```

Dört yol × 140 kare, benim makinemde toplam yarım saniye (ölçüldü: 0,49 s). Bilerek kısa tuttum; uzun otomatik süpürme makineyi ısıtıyor ve ikinci yolun ölçümünü birincinin sıcaklığıyla kirletiyor.

Gelelim sayılara. Önce donanımdan bağımsız olanlar — bunlar ölçüm değil, mimarinin doğrudan sonucu, çekinmeden yazıyorum:

| Yol | Çizim çağrısı | Sahne düğümü | GPU'daki geometri tamponu | Geometri VRAM |
|---|---|---|---|---|
| Naif (prop başına Mesh) | 1.200 | 1.200 | 40 | 79,8 KB |
| InstancedMesh (tip başına) | 40 | 40 | 40 | 79,8 KB + 89,1 KB tampon |
| BatchedMesh | 1 | 1 | 1 | 79,8 KB + 104,9 KB doku |
| mergeGeometries | 1 | 1 | 1 | 3,08 MB |

Çizim çağrısı sütununu "yapısal" diye yazdım ama tahmine bırakmadım: demodaki `G` tuşu dört yolu ayrı bir 1×1 renderer'da birer kez çizip gerçek `renderer.info.render.calls` değerini okuyor — zemin, gölge ve post-process zinciri sayıya karışmadan. Çıktı tam olarak 1.200 / 40 / 1 / 1.

Dördünde de üçgen sayısı aynı: 61.500. Bu sayı sahnelerin denk olduğunun kanıtı — `renderer.info.render.triangles` dört yolda da aynı çıkmıyorsa bir yerde bir şey eksik kurulmuş demektir. (Kamerayı sahnenin bir köşesine çevirdiğinde naif yol ve `BatchedMesh` bu sayıyı düşürür, çünkü ikisi de örnek düzeyinde eleme yapar. Süpürmenin son karesinde ikisi 52.976 üçgen çizdi, instanced ve merged yollar 61.504'te kaldı — iki okumadaki dört fazla üçgen zemin ve arka plan karesi.)

Sonra CPU tarafında Node'da ölçebildiklerim. Ölçüm koşulu: Apple M2 Pro (Mac14,9), Node 22.22.2, `three@0.185.1`, 13 koşumun medyanı (`npm run bench`):

| Yol | Kurulum (build) | `updateMatrixWorld` (kare başına) |
|---|---|---|
| Naif | 1,7 ms | 38,7 µs |
| InstancedMesh | 0,55 ms | 1,12 µs |
| BatchedMesh | 0,70 ms | 0,017 µs |
| mergeGeometries | 34,0 ms | 0,017 µs |

İki şey dikkatimi çekti, ikisi de yazıya başlarken beklediğimden farklıydı.

Birincisi merged yolun kurulum maliyeti. Otuz dört milisaniye, `BatchedMesh`'in kırk sekiz katı. Prop başına bir `clone()`, prop başına bir `applyMatrix4`, üstüne 65 bin vertex'lik bir birleştirme — hepsi tek karede olursa gözle görülür bir takılma yaratır. Seviye yüklenirken bir kez ödenirse sorun değil; oyun içinde dinamik olarak yeniden birleştirmeye kalkarsan sorun.

İkincisi sahne grafiği maliyeti. Burada kendi tezimi biraz törpülemem gerekiyor: naif yolun `updateMatrixWorld` faturası kare başına 38,7 µs. Bin iki yüz düğüm için kırk mikrosaniye; düğüm başına otuz iki nanosaniye. Instanced yola göre otuz beş kat, batch'e göre iki bin kat pahalı — ama mutlak değeri hâlâ bir milisaniyenin yirmi altıda biri. Rapier yazısında on bin gövdede sahne grafiği gerçekten canımı yakmıştı; bu ölçekte yakmıyor.

Yani bu ölçekte naif yolun asıl derdi sahne grafiği değil. Draw call'ın kendisi. GL komutlarını kodlamak, state'i doğrulamak, uniform'ları göndermek — bin iki yüz kez. O maliyet Node'da hiç görünmüyor, çünkü WebGL bağlamı yok; sadece tarayıcıda ortaya çıkıyor ve demodaki `M` süpürmesi onu ölçüyor.

| Yol | CPU kare p50 | CPU kare p95 |
|---|---|---|
| Naif | 1,51 ms | 1,69 ms |
| InstancedMesh | 0,065 ms | 0,075 ms |
| BatchedMesh | 0,26 ms | 0,30 ms |
| mergeGeometries | 0,020 ms | 0,030 ms |

Ölçüm koşulu: Apple M2 Pro (Mac14,9), Chrome 150 (ANGLE/Metal), 640×360 hedef, gölge geçişi ve bloom zinciri kapalı, yol başına 20 ısınma + 120 ölçüm karesi, beş koşumun medyanı. Naif yol instanced yolun yirmi üç, merged yolun yetmiş beş katı CPU harcıyor; draw call'ın faturası tam olarak burada kesiliyor.

Bir de beklemediğim şey: `BatchedMesh` tek çizim çağrısına rağmen instanced yoldan dört kat pahalı. Sebebi bedavaya verdiği şeyin bedeli — `perObjectFrustumCulled` ve `sortObjects` bin iki yüz örneği her karede CPU'da eleyip sıralıyor. İkisini kapatınca aynı yol 0,26 ms'den 0,020 ms'ye iniyor: o 0,24 ms'nin tamamı eleme ve sıralama. Demoda `C` ile kapatıp `M`'ye basarsan aynı sayıyı sen de görürsün. Bedava değil ama ucuz — on altı milisaniyelik bir kare bütçesinin yüzde biri buçuğu.

Mutlak değerler senin donanımına ait; oranlar mimariye. Kendi makinende `npm run dev` deyip `M`'ye basınca kendi sayıların çıkar.

### Karar Tablosu

Şimdi asıl mesele. Üç yolun hiçbiri "daha iyi" değil; üçü farklı bir takas.

| Durum | Yol | Feda ettiğin |
|---|---|---|
| Çok sayıda **aynı** prop, tip çeşitliliği düşük (ağaçlar, çimler, tuğlalar) | `InstancedMesh` | Per-object frustum culling — bir tipin bütün kopyaları ya çizilir ya çizilmez. Ayrıca tip sayısı kadar çizim çağrısı tabanı. |
| Çok sayıda **farklı** ama aynı materyalli prop (seviye dekoru, şehir mobilyası) | `BatchedMesh` | Materyal esnekliği (tek materyal), geometrilerin index/attribute uyumu, önden kapasite planlama. Bir de `WEBGL_multi_draw` bağımlılığı. |
| Hiç kımıldamayan, seçilmeyecek, hep görünür statik dekor (bina cepheleri, zemin döşemesi) | `mergeGeometries` | Tekil hareket, per-object culling, picking, per-object görünürlük ve VRAM (bizim sahnede 39,6×). Kurulum süresi de en pahalısı. |
| Her prop bağımsız hareket ediyor ve sayı birkaç yüzü geçmiyor | Naif `Mesh` | Hiçbir şey. Draw call maliyeti ölçtüğün bütçenin altındaysa optimizasyon yapma. |
| Her prop bağımsız hareket ediyor ve sayı binlerce | `InstancedMesh` + her kare `setMatrixAt` | Serinin altıncı yazısındaki senaryo; culling ve picking çözümünü elle kurmayı. |

Bu tablonun son satırı bir öncekiyle çelişiyor gibi durabilir; durmuyor. Naif yolu savunan satır ciddi. Bin iki yüz propta draw call farkı ölçülebilir, ama bir jam oyununda ya da bir prototipte aynı sahnenin naif hâli çoğu makinede sorunsuz döner ve seni hiçbir esneklikten mahrum bırakmaz. Ölçmeden optimize etmenin bedeli, ölçüp optimize etmemekten yüksek.

Pratikte üçü birlikte kullanılır. Ben şöyle bölüyorum: değişmeyen zemin ve duvarlar merged, hareketsiz ama etkileşimli seviye dekoru batched, kalabalık ve tek tipli her şey (yağmur, sürü, mermi) instanced. Üçünü aynı sahnede tutmanın maliyeti üç materyal ve üç kod yolu; kazancı, her nesne grubunun kendi doğasına uygun kapta durması.

### Deterministik Test: Tarayıcısız Kanıt

Bütün inşa katmanı bilerek render'dan bağımsız. `buildInstanced`, `buildBatched`, `buildMerged` ne kamera görür, ne `requestAnimationFrame`, ne WebGL bağlamı. Hepsi düz Node'da kurulabilir; `setMatrixAt` bir `Float32Array`'e, `addGeometry` bir tampona dokunur. Karşılığını burada alıyoruz.

İlk test determinizm guard'ı. Sahne planı iki kez üretilip hash'lenir; aynı tohum aynı hash'i vermek zorunda:

```ts
// tests/level-plan.test.ts
import { describe, expect, it } from "vitest";
import { planLevel } from "../src/level-plan.js";

/** Yerleşim listesinin FNV-1a hash'i — determinizm için ucuz parmak izi. */
function hashPlan(ps: ReturnType<typeof planLevel>): string {
  let h = 2166136261 >>> 0;
  for (const p of ps) {
    const s = `${p.typeIndex}|${p.x.toFixed(6)}|${p.z.toFixed(6)}|${p.rotY.toFixed(6)}|${p.scale.toFixed(6)}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}

describe("planLevel", () => {
  it("aynı tohum → aynı plan", () => {
    expect(hashPlan(planLevel(40, 30, 1337))).toBe(hashPlan(planLevel(40, 30, 1337)));
  });

  it("farklı tohum → farklı plan", () => {
    expect(hashPlan(planLevel(40, 30, 1337))).not.toBe(hashPlan(planLevel(40, 30, 7)));
  });

  it("her tipten tam perType kopya üretir", () => {
    const ps = planLevel(40, 30, 1337);
    expect(ps).toHaveLength(1200);
    const counts = new Map<number, number>();
    for (const p of ps) counts.set(p.typeIndex, (counts.get(p.typeIndex) ?? 0) + 1);
    expect(counts.size).toBe(40);
    for (const [, c] of counts) expect(c).toBe(30);
  });
});
```

İkincisi katalog sözleşmesi. Bu test `BatchedMesh`'in üç şartından ikisini doğrudan kilitliyor; `mergeVertices` çağrısını bir gün biri "gereksiz görünüyor" diye silerse tarayıcı açılmadan patlar:

```ts
// tests/catalog.test.ts
import { expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.js";

it("40 geometrinin hepsi indexed ve aynı attribute setine sahip", () => {
  const catalog = buildCatalog();
  expect(catalog).toHaveLength(40);

  const signature = Object.keys(catalog[0].geometry.attributes).sort().join("/");
  expect(signature).toBe("normal/position/uv");

  for (const entry of catalog) {
    // BatchedMesh: "All geometries must consistently have index."
    expect(entry.geometry.index, entry.name).not.toBeNull();
    // BatchedMesh: "All geometries must have consistent attributes."
    expect(Object.keys(entry.geometry.attributes).sort().join("/"), entry.name).toBe(signature);
  }
});
```

Üçüncüsü kapasite hesabı. Bütçenin örnek sayısıyla değil geometri sayısıyla ölçeklendiğini çivilemek istiyorum — çünkü bu yazının en öğretici tek cümlesi bu:

```ts
// tests/batched.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildBatched, planBatchCapacity } from "../src/build-batched.js";

it("bütçe benzersiz geometriye göre ölçeklenir, örnek sayısına göre değil", () => {
  const catalog = buildCatalog();
  const small = planBatchCapacity(catalog, planLevel(40, 5, 1));
  const large = planBatchCapacity(catalog, planLevel(40, 50, 1));

  // Örnek sayısı 10 kat arttı...
  expect(large.maxInstanceCount).toBe(small.maxInstanceCount * 10);
  // ...vertex/index bütçesi kılını kıpırdatmadı.
  expect(large.maxVertexCount).toBe(small.maxVertexCount);
  expect(large.maxIndexCount).toBe(small.maxIndexCount);
  expect(large.maxVertexCount).toBe(2169);
  expect(large.maxIndexCount).toBe(6150);
});

it("hesaplanan bütçe tam oturur, bir eksiği atar", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const mesh = buildBatched(catalog, placements, new THREE.MeshBasicMaterial());

  expect(mesh.instanceCount).toBe(1200);
  expect(mesh.unusedVertexCount).toBe(0); // bütçe tam; ne fazla ne eksik
  expect(mesh.unusedIndexCount).toBe(0);

  const cap = planBatchCapacity(catalog, placements);
  const tight = new THREE.BatchedMesh(
    cap.maxInstanceCount,
    cap.maxVertexCount - 1, // bir vertex eksik
    cap.maxIndexCount,
    new THREE.MeshBasicMaterial(),
  );
  expect(() => {
    for (let t = 0; t < 40; t++) tight.addGeometry(catalog[t].geometry);
  }).toThrow(/maximum buffer size/i);
});
```

Sonra merged geometrinin muhasebesi geliyor. Birleştirilmiş vertex sayısı parçaların toplamına eşit olmalı — eksikse bir şey sessizce düşmüş, fazlaysa bir şey iki kez eklenmiş demektir:

```ts
// tests/merged.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildMerged } from "../src/build-merged.js";

it("birleştirilmiş vertex/index sayısı parçaların toplamına eşittir", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);

  let expectedVerts = 0;
  let expectedIndices = 0;
  for (const p of placements) {
    const g = catalog[p.typeIndex].geometry;
    expectedVerts += g.attributes.position.count;
    expectedIndices += g.index!.count;
  }

  const mesh = buildMerged(catalog, placements, new THREE.MeshBasicMaterial());
  expect(mesh.geometry.attributes.position.count).toBe(expectedVerts); // 65.070
  expect(mesh.geometry.index!.count).toBe(expectedIndices); // 184.500
  // Renk vertex başına pişti: aynı sayıda color girdisi olmalı.
  expect(mesh.geometry.attributes.color.count).toBe(expectedVerts);
});
```

Beşincisi ve en sevdiğim: instanced ile batched yolun ürettiği transform'ların birebir aynı olduğunun kanıtı. İkisi de matrisleri f32 olarak saklıyor ve ikisi de aynı `placementMatrix` çıktısından besleniyor; o hâlde bit-bit eşit olmak zorunda. Ayrışırlarsa, bir yerde bir yol kendi kafasına göre bir dönüşüm uygulamış demektir:

```ts
// tests/parity.test.ts
import { expect, it } from "vitest";
import * as THREE from "three";
import { buildCatalog } from "../src/catalog.js";
import { planLevel } from "../src/level-plan.js";
import { buildInstanced } from "../src/build-instanced.js";
import { buildBatched } from "../src/build-batched.js";

it("instanced ve batched aynı yerleşim için bit-bit aynı matrisi üretir", () => {
  const catalog = buildCatalog();
  const placements = planLevel(40, 30, 1337);
  const material = new THREE.MeshBasicMaterial();

  const instancedRoot = buildInstanced(catalog, placements, material);
  const batched = buildBatched(catalog, placements, material);

  // batched örnekleri plan sırasıyla eklendi: instanceId === plan indeksi.
  const byType = new Map<number, number[]>();
  placements.forEach((p, i) => {
    if (!byType.has(p.typeIndex)) byType.set(p.typeIndex, []);
    byType.get(p.typeIndex)!.push(i);
  });

  const a = new THREE.Matrix4();
  const b = new THREE.Matrix4();
  for (const child of instancedRoot.children as THREE.InstancedMesh[]) {
    const typeIndex = catalog.findIndex((c) => c.geometry === child.geometry);
    const planIndices = byType.get(typeIndex)!;
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, a);
      batched.getMatrixAt(planIndices[i], b);
      for (let e = 0; e < 16; e++) expect(a.elements[e]).toBe(b.elements[e]);
    }
  }
});
```

Beşi de tarayıcı açmıyor, hiçbiri gerçek bir kare beklemiyor. `BatchedMesh` bir WebGL bağlamı olmadan da kuruluyor, `addGeometry` bağlamsız çalışıyor, `getMatrixAt` sadece bir `Float32Array`'den okuyor. Render'a bağlı olmayan her şeyi render'dan ayırınca kazandığın şey bu: iddialarını `toBe` ile kanıtlarsın.

### Demo: Dört Yol, Bir Tuş

Demoda kırk tip, bin iki yüz prop ve bir zemin var. `1/2/3/4` tuşları dört inşa yolu arasında geçiş yapıyor; sahne o an yıkılıp yeniden kuruluyor ve kurulum süresi HUD'a yazılıyor. `M` yukarıdaki kısa süpürmeyi çalıştırıyor, `G` ise props-only çizim çağrısı probe'unu. `C` `BatchedMesh`'in `perObjectFrustumCulled` + `sortObjects` ikilisini açıp kapatıyor — kamerayı sahnenin kenarına çevirip bu tuşa basınca üçgen sayacının inip çıktığını görüyorsun. Fareyle tıklamak ise raycast yapıp konsola ne bulduğunu yazıyor: instanced yolda `instanceId`, batched yolda `batchId`, merged yolda sadece `faceIndex`.

HUD'da her sayının yanında ne olduğu yazıyor: `GL CALLS · REAL` her karede `renderer.info.render.calls`'tan okunan gerçek sayaç (zemin, grid ve post-process zinciri dahil), `PROP DRAW · MODEL` ise prop'ları çizmenin yapısal maliyeti. İkisini karıştırmak, "1 draw call" yazıp 1.200 çizmenin en kolay yolu.

O son satır bütün yazının özeti gibi. Aynı ekran görüntüsü, aynı üçgenler, aynı renkler — ama merged yolda tıkladığın varilin kim olduğunu bilmiyorsun.

HUD'da `WEBGL_multi_draw` uzantısının durumu da yazıyor. Uzantı yoksa `BatchedMesh` satırındaki çizim çağrısı 1 değil, çizilen örnek sayısı kadar görünür; sayının neden "yanlış" olduğunu aramaman için orada duruyor.

Demo Vite ile çalışıyor: `npm run dev` deyip tarayıcıda aç. `file://` ile açarsan modüller yüklenmez, boş ekran görürsün — bu serinin her yazısında tekrarlıyorum çünkü yeterince kez yedim.

### Özetle:

1. Prop başına bir `Mesh`, prop sayısı kadar çizim çağrısı demektir. Ama geometri ve materyal paylaşıldığı sürece VRAM'de fazladan bir şey ödemezsin; naif yolun bedeli bellek değil, sipariş fişi sayısı.
2. `InstancedMesh` tip başına bir çizim çağrısına indirir. Bir mesh içinde geometri tektir; kırk prop tipin varsa taban kırktır ve aşağı inmez.
3. `InstancedMesh` frustum culling'i mesh düzeyinde yapar. Bir tipin kopyaları haritaya yayılmışsa o mesh hiç elenmez — eleme çözünürlüğünü kaybedersin.
4. `BatchedMesh` (r156+) aynı materyalle farklı geometrileri tek çizim çağrısında toplar. Vertex/index bütçesi örnek sayısına değil, **benzersiz geometri** sayısına göre hesaplanır: bizde 1.200 örnek için 2.169 vertex.
5. `BatchedMesh`'in üç şartı var: bütün geometriler ya hep indexed ya hiç, hepsinin attribute seti aynı, bütçe önden planlanmış. `PolyhedronGeometry` soyu index'siz doğar; `mergeVertices()` ile indexle.
6. `BatchedMesh` per-object frustum culling'i, per-instance görünürlüğü, silmeyi ve raycast'te `batchId`'yi bedavaya verir. "Tek çizim çağrısı" iddiası `WEBGL_multi_draw` uzantısına bağlı; yoksa three döngüye geri düşer.
7. `mergeGeometries` transform'u vertex konumlarına pişirir. En az çizim çağrısı, en yüksek VRAM (bizde 79,8 KB → 3,08 MB) ve en pahalı kurulum (34 ms). Tekil hareket, culling, picking ve per-object görünürlük gider.
8. Ölçerken tek değişken bırak: aynı tohumlu plan, aynı materyal, kare indeksine bağlı aynı kamera yolu. Ortalama değil p50/p95 bak; süpürmeyi kısa tut, yoksa ikinci ölçümü birincinin ısıttığı makinede alırsın.
9. İnşa katmanını render'dan ayır. Determinizm, katalog sözleşmesi, kapasite hesabı, merged vertex muhasebesi ve instanced–batched transform paritesi — beşi de tarayıcısız kanıtlanır.
10. Üçü rakip değil, takım. Statik zemin merged, etkileşimli dekor batched, tek tipli kalabalık instanced.

Repoda `npm test` bütün inşa katmanını tarayıcısız doğruluyor; `npm run dev` seni kırk tipli bir seviye dolgusuyla ve tuşla değiştirilen dört inşa yoluyla buluşturuyor.

Bu yazıyı yazarken beni en çok şu düşündürdü: üç yolun hiçbiri "optimizasyon" değil, üçü de bir **kap seçimi**. Kabı seçtiğin an nesnelerinin nasıl hareket edebileceğini, nasıl seçilebileceğini, nasıl elenebileceğini de seçmiş oluyorsun — draw call sayısı o kararın sadece en görünür yan etkisi. Ölçüm masasına oturduğumda tabloyu ben de "hangisi kazanır" diye kurmuştum. Kalktığımda tablonun en değerli sütununun hız değil, en sağdaki *feda ettiğin* sütunu olduğunu gördüm. ⚙️📦
