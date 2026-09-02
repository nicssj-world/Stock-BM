import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260902015245_lab_code_equipment_lookup.sql"),
  "utf8",
);

describe("LAB-code equipment lookup migration", () => {
  it("syncs one item without archiving items outside the request", () => {
    expect(sql).toContain("create or replace function public.sync_bm_equipment_by_lab_code");
    expect(sql).toContain("archived_count = 0");
    expect(sql).toContain("A valid Portal LAB code is required");
  });

  it("preserves the current image when Portal has no photo and replaces it when one exists", () => {
    expect(sql).toContain("p_portal_photo is not null");
    expect(sql).toContain("source");
    expect(sql).toContain("'portal_sync'");
    expect(sql).toContain("delete from public.bm_attachments");
  });
});
