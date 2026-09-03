// view/hud.ts — cam panel HUD'u. İki tür sayı var ve ikisi ayrı etiketlenir:
//   · REAL  → renderer'dan/saatten O KARE okunan ölçüm (GL CALLS, TRIANGLES, CPU).
//   · MODEL → mimarinin doğrudan sonucu, ölçüm değil (PROP DRAW, SCENE NODES, tampon).
// Karıştırmak, "1 draw call" yazıp 1.200 çizmenin en kolay yolu.
import { formatBytes } from "../geometry-bytes.js";
import type { PathResult } from "../measure.js";

export interface HudElements {
  paths: NodeListOf<HTMLElement>;
  calls: HTMLElement;
  propDraw: HTMLElement;
  tris: HTMLElement;
  nodes: HTMLElement;
  p50: HTMLElement;
  p95: HTMLElement;
  mem: HTMLElement;
  build: HTMLElement;
  flagMultiDraw: HTMLElement;
  flagCulling: HTMLElement;
  sweepBody: HTMLElement;
  probeBody: HTMLElement;
  pick: HTMLElement;
  busy: HTMLElement;
}

export interface HudFrame {
  calls: number;
  triangles: number;
  propDraw: number;
  nodes: number;
  cpuP50: number;
  cpuP95: number;
  geometryBytes: number;
  instanceBytes: number;
  buildMs: number;
}

const NF = new Intl.NumberFormat("tr-TR");

function ms(v: number): string {
  return `${v.toFixed(2).replace(".", ",")} ms`;
}

export class Hud {
  constructor(private readonly el: HudElements) {}

  setPath(index: number, label: string): void {
    this.el.paths.forEach((p) => {
      p.classList.toggle("active", Number(p.dataset.path) === index);
    });
    document.title = `${label} — Aynı Sahne, Dört İnşa Yolu`;
  }

  render(f: HudFrame): void {
    const e = this.el;
    e.calls.textContent = NF.format(f.calls);
    e.propDraw.textContent = NF.format(f.propDraw);
    e.tris.textContent = NF.format(f.triangles);
    e.nodes.textContent = NF.format(f.nodes);
    e.p50.textContent = ms(f.cpuP50);
    e.p95.textContent = ms(f.cpuP95);
    e.mem.textContent = `${formatBytes(f.geometryBytes)} + ${formatBytes(f.instanceBytes)}`;
    e.build.textContent = ms(f.buildMs);
  }

  /**
   * İki bayrak da BatchedMesh'e ait. batchCull, `perObjectFrustumCulled` +
   * `sortObjects` ikilisinin o anki değeri: C tuşu bunu çevirir ve M süpürmesi
   * bu değerle koşar, böylece elemenin CPU faturası ayrı ayrı ölçülebilir.
   */
  setFlags(multiDraw: boolean, batchCull: boolean): void {
    const md = this.el.flagMultiDraw;
    md.className = `flag ${multiDraw ? "on" : "off"}`;
    md.textContent = multiDraw ? "WEBGL_MULTI_DRAW: YES" : "WEBGL_MULTI_DRAW: NO";

    const c = this.el.flagCulling;
    c.className = `flag ${batchCull ? "on" : "off"}`;
    c.textContent = `BATCH CULL+SORT: ${batchCull ? "ON" : "OFF"}`;
  }

  setBusy(text: string | null): void {
    this.el.busy.textContent = text ?? "";
    this.el.busy.classList.toggle("on", text !== null);
  }

  setPick(text: string): void {
    this.el.pick.textContent = text;
  }

  /** M süpürmesinin sonucu: ölçülen CPU kare süreleri + o karenin sayaçları. */
  setSweep(results: PathResult[], note: string): void {
    const rows = results
      .map(
        (r) => `<tr>
          <td>${r.name}</td>
          <td>${r.cpuP50.toFixed(2).replace(".", ",")}</td>
          <td>${r.cpuP95.toFixed(2).replace(".", ",")}</td>
          <td>${NF.format(r.drawCalls)}</td>
          <td>${NF.format(r.triangles)}</td>
        </tr>`,
      )
      .join("");
    this.el.sweepBody.innerHTML = `<table class="grid">
      <tr><th>PATH</th><th>p50 MS</th><th>p95 MS</th><th>GL CALLS</th><th>TRIS</th></tr>
      ${rows}
    </table><div class="note">${note}</div>`;
  }

  /** G probe'unun sonucu: props-only gerçek GL çağrısı. */
  setProbe(rows: Array<{ name: string; calls: number; triangles: number }>, note: string): void {
    const body = rows
      .map(
        (r) => `<tr>
          <td>${r.name}</td>
          <td>${NF.format(r.calls)}</td>
          <td>${NF.format(r.triangles)}</td>
        </tr>`,
      )
      .join("");
    this.el.probeBody.innerHTML = `<table class="grid">
      <tr><th>PATH</th><th>GL CALLS · REAL</th><th>TRIS</th></tr>
      ${body}
    </table><div class="note">${note}</div>`;
  }
}

export function collectHudElements(): HudElements {
  const byId = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`HUD elemanı yok: #${id}`);
    return el;
  };
  return {
    paths: document.querySelectorAll<HTMLElement>(".path"),
    calls: byId("stat-calls"),
    propDraw: byId("stat-propdraw"),
    tris: byId("stat-tris"),
    nodes: byId("stat-nodes"),
    p50: byId("stat-p50"),
    p95: byId("stat-p95"),
    mem: byId("stat-mem"),
    build: byId("stat-build"),
    flagMultiDraw: byId("flag-multidraw"),
    flagCulling: byId("flag-culling"),
    sweepBody: byId("sweep-body"),
    probeBody: byId("probe-body"),
    pick: byId("pick"),
    busy: byId("busy"),
  };
}
