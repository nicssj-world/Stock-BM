import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "lib/server/equipment.ts"),
  "utf8",
);

describe("equipment stock location link", () => {
  it("loads shared locations and resolves the selected id on the server", () => {
    expect(source).toContain('.from("bm_stock_locations")');
    expect(source).toContain('.eq("id", locationId)');
    expect(source).toContain('throw new HttpError(400, "ไม่พบ Location คลังน้ำยาที่เลือก")');
  });

  it("stores both the foreign key and a readable location snapshot", () => {
    expect(source).toContain("location_id: locationId");
    expect(source).toContain("location.code");
    expect(source).toContain("location.name");
  });
});
