import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "lib/server/equipment.ts"),
  "utf8",
);
const route = readFileSync(
  join(process.cwd(), "app/api/equipment/items/[id]/classification/route.ts"),
  "utf8",
);

describe("equipment classification (Stock-BM local override)", () => {
  it("writes only the category column, never touching sync-owned fields", () => {
    const fn = source.slice(
      source.indexOf("export async function updateEquipmentClassification"),
      source.indexOf("export async function rotateEquipmentToken"),
    );
    expect(fn).toContain('.from("bm_equipment")');
    expect(fn).toContain("category: category?.trim() || null");
    expect(fn).not.toContain("name:");
    expect(fn).not.toContain("portal_");
  });

  it("requires the same non-Assistant access as other equipment edits and audits the change", () => {
    const fn = source.slice(
      source.indexOf("export async function updateEquipmentClassification"),
      source.indexOf("export async function rotateEquipmentToken"),
    );
    expect(fn).toContain("assertAccess(actor)");
    expect(fn).toContain('"equipment.classification.update"');
  });

  it("exposes a dedicated PATCH route, the same pattern as the local location field", () => {
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("updateEquipmentClassification(");
    expect(route).toContain("category: z.string().trim().max(120).nullable()");
  });
});
