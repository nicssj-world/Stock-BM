import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "lib/server/equipment.ts"),
  "utf8",
);

describe("equipment Asset No. placeholder", () => {
  it("normalizes a dash to null before saving equipment", () => {
    expect(source).toContain("function cleanAssetNumber");
    expect(source).toContain('return assetNumber === "-" ? null : assetNumber;');
    expect(source).toContain("asset_number: cleanAssetNumber(input.assetNumber)");
  });
});
