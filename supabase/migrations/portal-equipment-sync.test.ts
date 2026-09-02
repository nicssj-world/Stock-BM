import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260901150000_portal_equipment_sync.sql"),
  "utf8",
);

describe("Portal equipment sync migration", () => {
  it("stores the Portal identity, display metadata and local-only sync state", () => {
    for (const column of [
      "portal_equipment_id uuid",
      "portal_department_code text",
      "portal_department_name text",
      "portal_status text",
      "portal_location text",
      "portal_updated_at timestamptz",
      "last_synced_at timestamptz",
      "sync_state text",
      "archived_at timestamptz",
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("bm_equipment_portal_equipment_unique");
    expect(sql).toContain("sync_state = 'archived'");
    expect(sql).toContain("Local service workflow fields remain local");
  });

  it("keeps Portal PM/CAL cache separate from local plans and history", () => {
    expect(sql).toContain("create table if not exists public.bm_equipment_portal_pmcal");
    expect(sql).toContain("create table if not exists public.bm_equipment_sync_runs");
    expect(sql).toContain("create table if not exists public.bm_equipment_sync_issues");
    expect(sql).toContain("add column if not exists portal_plan_id uuid");
    expect(sql).toContain("add column if not exists equipment_snapshot jsonb");
    expect(sql).toContain("record_status = 'cancelled'");
    expect(sql).toContain("bm_equipment_service_portal_plan_fk");
  });

  it("applies a full snapshot atomically and protects ambiguous matches", () => {
    expect(sql).toContain("create or replace function public.sync_bm_equipment_snapshot");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("Portal snapshot contains duplicate equipment ids");
    expect(sql).toContain("jsonb_array_elements_text");
    expect(sql).toContain("issue_type in ('ambiguous_match', 'identity_conflict', 'unmatched_local')");
    expect(sql).toContain("resolve_bm_equipment_sync_issue");
    expect(sql).toContain("revoke all on function public.sync_bm_equipment_snapshot");
    expect(sql).toContain("grant execute on function public.sync_bm_equipment_snapshot");
  });

});
