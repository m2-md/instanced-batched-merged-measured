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
