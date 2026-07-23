import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260723034137_equipment_management.sql",
  ),
  "utf8",
);

describe("equipment management migration", () => {
  it("creates registry, plans, service records and module links", () => {
    expect(sql).toContain("create table public.bm_equipment (");
    expect(sql).toContain("create table public.bm_equipment_plans (");
    expect(sql).toContain("create table public.bm_equipment_service_records (");
    expect(sql).toContain("create table public.bm_equipment_module_links (");
    expect(sql).toContain("bm_equipment_serial_unique");
    expect(sql).toContain("bm_equipment_asset_unique");
  });

  it("keeps QR submissions private and idempotent", () => {
    expect(sql).toContain(
      "source <> 'public_qr' or idempotency_key is not null",
    );
    expect(sql).toContain("bm_equipment_service_idempotency");
    expect(sql).toContain("source in ('internal', 'public_qr')");
    expect(sql).toContain("public.current_bm_role() in ('Admin', 'Staff')");
  });

  it("approves records and advances linked plans atomically", () => {
    expect(sql).toContain(
      "create or replace function public.approve_equipment_service_record",
    );
    expect(sql).toContain(
      "create or replace function public.add_equipment_interval",
    );
    expect(sql).toContain("interval '1 month - 1 day'");
    expect(sql).toContain("for update");
    expect(sql).toContain("set status = 'approved'");
    expect(sql).toContain("Plan does not belong to equipment");
    expect(sql).toContain(
      "grant execute on function public.approve_equipment_service_record(uuid, uuid) to service_role",
    );
  });
});
