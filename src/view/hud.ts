// view/hud.ts — the glass-panel HUD. There are two kinds of number and each is labeled:
//   · REAL  → a measurement read THAT FRAME from the renderer/clock (GL CALLS, TRIANGLES, CPU).
//   · MODEL → a direct consequence of the architecture, not a measurement (PROP DRAW, SCENE NODES, buffers).
// Mixing them up is the easiest way to write "1 draw call" and draw 1,200.
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

const NF = new Intl.NumberFormat("en-US");

function ms(v: number): string {
  return `${v.toFixed(2)} ms`;
}

export class Hud {
  constructor(private readonly el: HudElements) {}

  setPath(index: number, label: string): void {
    this.el.paths.forEach((p) => {
      p.classList.toggle("active", Number(p.dataset.path) === index);
    });
    document.title = `${label} — One Scene, Four Build Paths`;
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
   * Both flags belong to BatchedMesh. batchCull is the current value of the
   * `perObjectFrustumCulled` + `sortObjects` pair: the C key flips it and the M sweep
   * runs with that value, so the CPU bill of culling can be measured separately.
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

  /** The result of the M sweep: measured CPU frame times + that frame's counters. */
  setSweep(results: PathResult[], note: string): void {
    const rows = results
      .map(
        (r) => `<tr>
          <td>${r.name}</td>
          <td>${r.cpuP50.toFixed(2)}</td>
          <td>${r.cpuP95.toFixed(2)}</td>
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

  /** The result of the G probe: props-only real GL calls. */
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
    if (!el) throw new Error(`HUD element not found: #${id}`);
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
