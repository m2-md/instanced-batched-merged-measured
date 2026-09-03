# Aynı Sahne, Dört İnşa Yolu — InstancedMesh · BatchedMesh · mergeGeometries

"InstancedMesh mi, BatchedMesh mi, mergeGeometries mi? Aynı Sahne, Üç İnşa Yolu,
Ölçülmüş Bir Karar Tablosu" makalesinin çalışan kodu. Tek bir tohumlu seviye planı
(40 prop tipi × 30 kopya = **1.200 prop**, tek materyal) dört ayrı kapla kuruluyor:

1. **Naif** — prop başına bir `THREE.Mesh` (geometri ve materyal paylaşılır).
2. **InstancedMesh** — prop TİPİ başına bir mesh, 40 çizim çağrısı.
3. **BatchedMesh** — 40 farklı geometri + 1.200 örnek, tek çizim çağrısı.
4. **mergeGeometries** — hepsi tek dev `BufferGeometry`, transform vertex'e pişer.

Çekirdek fikir: bütün inşa katmanı (`src/build-*.ts`) render'dan ayrık. Ne
`WebGLRenderer` görür, ne kamera, ne `requestAnimationFrame`. Bu yüzden dört yolun
doğruluğu **tarayıcı açmadan** kanıtlanabiliyor (`npm test`), CPU faturası ise
tarayıcıda elle tetiklenen kısa bir süpürmeyle ölçülüyor (`M` tuşu).

## Sürümler

- `three@0.185.1` + `@types/three` — `BatchedMesh` (r156+), `BufferGeometryUtils`,
  `RoomEnvironment`, `UnrealBloomPass`; hepsi paket içinde, harici varlık yok.
- Vite + TypeScript + Vitest, npm.
- Gölge: `PCFShadowMap` (`PCFSoftShadowMap` r185'te deprecate).

## Kurulum

```bash
npm install
```

## Çalıştırma

```bash
npm run dev
```

`http://localhost:5173/` — **`file://` ile AÇMA**, ES modülleri yüklenmez ve boş
ekran görürsün. Vite dev sunucusu şart.

### Tuşlar

| Tuş | İş |
|---|---|
| `1` `2` `3` `4` | naif · instanced · batched · merged yola geç (sahne yıkılıp yeniden kurulur) |
| `M` | kısa CPU kare süpürmesi: yol başına 20 ısınma + 120 ölçüm karesi |
| `G` | props-only GL çağrı probe'u: ayrı bir 1×1 renderer'da gerçek `renderer.info.render.calls` |
| `C` | `BatchedMesh.perObjectFrustumCulled` + `sortObjects` aç/kapat (süpürme de bu değerle koşar) |
| `P` | otomatik yörünge ↔ elle orbit (fareyle sürükle) |
| tık | raycast: instanced → `instanceId`, batched → `batchId`, merged → sadece `faceIndex` |

URL parametreleri: `?path=1..4` açılış yolunu seçer, `?nocull=1` batch elemesini
kapalı başlatır, `?bench=1` probe + süpürmeyi kendiliğinden koşup sonucu
`bench-result.json`'a yazar (aşağıya bak).

### HUD: ÖLÇÜM mü, MODEL mi?

HUD'daki her sayı etiketli, çünkü ikisi karıştırılırsa "1 draw call" yazıp 1.200
çizmek çok kolay:

- `· REAL` → o karede `renderer.info`'dan veya `performance.now()`'dan okunan
  **ölçüm**. `GL CALLS · REAL` sahnenin TAMAMIDIR: prop'lar + zemin + grid +
  arka plan + `RenderPass`/`UnrealBloomPass`/`OutputPass` zinciri.
- `· MODEL` → mimarinin doğrudan sonucu, ölçüm değil: `PROP DRAW`, `SCENE NODES`,
  geometri/instance tamponu baytları.

## Test (tarayıcı gerekmez)

```bash
npm test
```

**13 test yeşil** olmalı:

| Dosya | Ne kanıtlıyor |
|---|---|
| `tests/level-plan.test.ts` (3) | aynı tohum → aynı plan (FNV-1a hash), farklı tohum → farklı plan, her tipten tam 30 kopya |
| `tests/catalog.test.ts` (1) | 40 geometrinin hepsi indexed ve attribute seti `normal/position/uv` — `BatchedMesh`'in iki şartı |
| `tests/batched.test.ts` (2) | bütçe örnek sayısına değil BENZERSİZ geometriye göre ölçekleniyor (2.169/6.150); hesaplanan bütçe tam oturuyor, bir vertex eksiği `maximum buffer size` ile atıyor |
| `tests/merged.test.ts` (1) | birleştirilmiş vertex/index sayısı parçaların toplamına eşit (65.070 / 184.500) ve renk vertex başına pişmiş |
| `tests/parity.test.ts` (1) | instanced ve batched yol aynı yerleşim için **bit-bit** aynı matrisi üretiyor |
| `tests/naive.test.ts` (1) | 1.200 düğüm ama 40 geometri + 1 materyal paylaşılıyor; instance tamponu 0 bayt |
| `tests/memory.test.ts` (2) | InstancedMesh instance tamponu 91.200 B; BatchedMesh dokuları 107.444 B (72² matris + 35² indirect + 35² renk) |
| `tests/accounting.test.ts` (2) | katalog 81.708 B; merged geometri **Uint16** index ile 3.232.080 B = katalogun 39,6 katı; vertex rengi 780.840 B = örnek renginin 54,2 katı |

## Ölçüm

### 1. Node tarafı: kurulum + sahne grafiği (`npm run bench`)

```bash
npm run bench
```

Ölçüm koşulu: Apple M2 Pro (Mac14,9), Node 22.22.2, `three@0.185.1`, 13 koşumun
medyanı. `updateMatrixWorld` çağrı başına ölçümü kalibrelidir: tekrar sayısı bir
örnek 20 ms'yi geçene kadar dörtlenir (mikrosaniye altı işi tek tek ölçmek saat
çözünürlüğüne çarpar).

| Yol | Kurulum | `updateMatrixWorld`/kare |
|---|---|---|
| Naif | 1,7 ms | 38,7 µs |
| InstancedMesh | 0,55 ms | 1,12 µs |
| BatchedMesh | 0,70 ms | 0,017 µs |
| mergeGeometries | 34,0 ms | 0,017 µs |

Aynı koşum yapısal tampon faturasını da basar: katalog 81.708 B (79,8 KB),
instanced +91.200 B, batched +107.444 B doku, merged 3.232.080 B (3,08 MB).

### 2. Tarayıcı tarafı: CPU kare süresi (`M` tuşu)

Süpürme render'dan ayrık tutulur — ölçülen şey draw call'ı **yazmanın** CPU
maliyeti:

- 640×360 `WebGLRenderTarget`'a düz `renderer.render` (post-process zinciri YOK),
- `shadowMap.autoUpdate = false` (gölge haritası inşa başına bir kez çizilir),
- kamera pozu kare indeksine bağlı (`cameraPose(f, 120)`), dört yol aynı 140 kareyi
  aynı pozlardan görür,
- yol başına 20 ısınma + 120 ölçüm karesi; toplam süpürme **~0,5 s**.

Ölçüm koşulu: Apple M2 Pro (Mac14,9), Chrome 150 headless (ANGLE Metal), dpr 1,
beş koşumun medyanı:

| Yol | CPU kare p50 | CPU kare p95 | GL çağrısı (süpürme karesi) | Üçgen |
|---|---|---|---|---|
| Naif | 1,51 ms | 1,69 ms | 1.042 | 52.976 |
| InstancedMesh | 0,065 ms | 0,075 ms | 43 | 61.504 |
| BatchedMesh | 0,26 ms | 0,30 ms | 4 | 52.976 |
| mergeGeometries | 0,020 ms | 0,030 ms | 4 | 61.504 |

Süpürme karesindeki GL çağrısı ve üçgen sayısı **sahnenin tamamına** aittir
(prop + zemin + grid + arka plan = 3 fazladan çağrı). Naif yol ve `BatchedMesh`
örnek düzeyinde eleme yaptığı için üçgen sayısı kadrajla birlikte iniyor (52.976),
instanced ve merged yollar inmiyor (61.504).

`C` ile `perObjectFrustumCulled` + `sortObjects` kapatılırsa `BatchedMesh` p50'si
**0,26 ms → 0,020 ms**'ye iner: o farkın tamamı 1.200 örneği her karede CPU'da
eleyip sıralamanın bedeli.

Aynı sahnenin post-process zinciri dahil GERÇEK kare süresi (1440×900, dpr 1,
naif yol, bloom + gölge açık): p50 2,26 ms · p95 2,53 ms · 1.078 GL çağrısı.

### 3. Yapısal tablonun ölçülmüş hâli (`G` tuşu)

`G`, dört yolu ayrı bir 1×1 `WebGLRenderer`'da (ortografik kutu, eleme yok) birer
kez çizip gerçek sayacı okur — zemin, gölge ve post-process karışmadan:

| Yol | `renderer.info.render.calls` | Üçgen |
|---|---|---|
| Naif | 1.200 | 61.500 |
| InstancedMesh | 40 | 61.500 |
| BatchedMesh | 1 | 61.500 |
| mergeGeometries | 1 | 61.500 |

`BatchedMesh`'in "1" değeri `WEBGL_multi_draw` uzantısına bağlı; uzantı yoksa three
döngüye geri düşer ve sayaç örnek sayısına yaklaşır. HUD'daki
`WEBGL_MULTI_DRAW: YES/NO` etiketi tam bu yüzden var.

### `?bench=1` — ölçümü diske yazmak

`vite.config.ts` içindeki `bench-sink` eklentisi `POST /__bench`'i dinler; demo
`?bench=1` ile açılırsa probe + süpürme kendiliğinden koşar ve sonuç proje köküne
`bench-result.json` olarak yazılır (GPU adı, `crossOriginIsolated`, p50/p95,
probe, tampon raporu).

Dev sunucusu **COOP/COEP** başlıkları yayınlıyor (`vite.config.ts`): cross-origin
isolation olmadan Chrome `performance.now()`'u 100 µs'ye yuvarlar ve merged yolun
kare süresi olduğu gibi `0,00 ms` görünür. İzole bağlamda saat 5 µs çözünürlüğe
çıkıyor.

## Derleme

```bash
npm run build      # tsc && vite build
npm run preview
```

## Dosya yapısı

```
src/
  rng.ts              # mulberry32 — tohumlu üreteç
  catalog.ts          # 8 aile × 5 boy = 40 prop tipi (PolyhedronGeometry'ler mergeVertices'ten geçer)
  level-plan.ts       # planLevel + placementMatrix (scratch'ler döngü dışında)
  build-naive.ts      # prop başına Mesh
  build-instanced.ts  # tip başına InstancedMesh
  build-batched.ts    # planBatchCapacity + tek BatchedMesh
  build-merged.ts     # mergeGeometries + vertex renkleri
  camera-path.ts      # kare indeksine bağlı deterministik yörünge
  frame-timer.ts      # halka tampon (serinin ilk yazısından)
  stats.ts            # percentile / p50 / p95 / mean
  measure.ts          # measurePath: ısınma + ölçüm + sayaç okuma
  geometry-bytes.ts   # attribute/index bayt muhasebesi + memoryReport
  gl-probe.ts         # 1×1 renderer'da props-only draw call probe'u
  main.ts             # demo: dört yol, tuşlar, süpürme, raycast
  view/
    stage.ts          # dark cinematic sahne, PCFShadowMap, RoomEnvironment/PMREM
    hud.ts            # cam panel HUD'u; REAL/MODEL ayrımı
    postfx.ts         # EffectComposer + UnrealBloomPass (yarım çözünürlük) + OutputPass
bench/
  build-bench.ts      # Node ölçümü: kurulum + updateMatrixWorld + tampon faturası
tests/                # 8 dosya, 13 test — hiçbiri tarayıcı açmaz
```

## Bilinen sınırlar (dürüstlük notları)

- **Naif yol tek materyali paylaştığı için örnek başına renk alamaz.** Dört yolun
  üçgen ve çizim çağrısı sayıları aynı, ama naif sahne tek tonda görünür. Örnek
  başına rengi naif yola da vermek istersen mesh başına materyal gerekir — o zaman
  geometri/materyal paylaşımı biter ve karşılaştırma bozulur.
- **`BatchedMesh` instance dokuları private alanlardan okunuyor**
  (`_matricesTexture`, `_indirectTexture`, `_colorsTexture`). `geometry-bytes.ts`
  alan yoksa sessizce atlar; three bu alanları yeniden adlandırırsa bayt hesabı
  0'a düşer, patlamaz.
- **Süpürme sayıları demonun canlı kare süresi değil.** Süpürmede bloom ve gölge
  geçişi kapalı, hedef 640×360. Canlı kare süresi HUD'daki `CPU FRAME p50/p95`
  satırında ayrıca duruyor.
- Ölçümler headless Chrome ile alındı (gerçek GPU: ANGLE Metal / M2 Pro). Kendi
  makinende mutlak değerler değişir; oranlar mimariden geliyor.

## Lisans

MIT — bkz. `LICENSE`.
