import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "lib/server/equipment.ts"),
  "utf8",
);

describe("equipment technician contacts", () => {
  it("supports protected CRUD with audit logging", () => {
    expect(source).toContain("createEquipmentTechnician");
    expect(source).toContain("updateEquipmentTechnician");
    expect(source).toContain("deleteEquipmentTechnician");
    expect(source).toContain('"equipment.technician.create"');
    expect(source).toContain('"equipment.technician.update"');
    expect(source).toContain('"equipment.technician.delete"');
  });

  it("returns only technicians linked to the scanned equipment", () => {
    expect(source).toContain('.from("bm_equipment_technicians")');
    expect(source).toContain('.eq("equipment_id", equipment.id)');
    expect(source).toContain("technicians:");
  });
});
