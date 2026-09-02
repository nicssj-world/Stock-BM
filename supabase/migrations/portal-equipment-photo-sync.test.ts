import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260902012011_equipment_portal_photo_sync.sql"),
  "utf8",
);

describe("Portal equipment photo sync migration", () => {
  it("allows Portal-origin attachments and wraps the existing snapshot transaction", () => {
    expect(sql).toContain("source in ('internal', 'public_qr', 'portal_sync')");
    expect(sql).toContain("sync_bm_equipment_snapshot_without_photos");
    expect(sql).toContain("create or replace function public.sync_bm_equipment_snapshot");
    expect(sql).toContain("v_result := public.sync_bm_equipment_snapshot_without_photos");
  });

  it("replaces only when a staged Portal photo exists and returns old paths for cleanup", () => {
    expect(sql).toContain("v_photo := v_operation->'portal_photo'");
    expect(sql).toContain("No Portal image means keep the current Stock-BM image unchanged");
    expect(sql).toContain("kind = 'equipment-photo'");
    expect(sql).toContain("'portal_sync'");
    expect(sql).toContain("'replaced_photo_paths'");
  });
});
