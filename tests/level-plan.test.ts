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
