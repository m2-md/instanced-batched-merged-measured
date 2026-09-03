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
