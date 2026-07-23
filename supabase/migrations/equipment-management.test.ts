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
const locationLinkSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260723131500_equipment_stock_location_link.sql",
  ),
  "utf8",
);
const technicianSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260723183000_equipment_technicians.sql",
  ),
  "utf8",
);
const assetNumberPlaceholderSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260723190000_equipment_asset_number_placeholder.sql",
  ),
  "utf8",
);
const planDueMonthSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260723193000_equipment_plan_due_month.sql",
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

  it("links equipment to the shared stock location registry", () => {
    expect(locationLinkSql).toContain(
      "location_id uuid references public.bm_stock_locations(id) on delete set null",
    );
    expect(locationLinkSql).toContain("create index bm_equipment_location_id");
    expect(locationLinkSql).toContain("update public.bm_equipment as equipment");
  });

  it("creates a protected technician registry linked to each equipment item", () => {
    expect(technicianSql).toContain(
      "equipment_id uuid not null references public.bm_equipment(id) on delete cascade",
    );
    expect(technicianSql).toContain(
      "alter table public.bm_equipment_technicians enable row level security",
    );
    expect(technicianSql).toContain(
      "using (public.current_bm_role() in ('Admin', 'Staff'))",
    );
    expect(technicianSql).toContain(
      "grant select, insert, update, delete on public.bm_equipment_technicians to service_role",
    );
  });

  it("treats a dash Asset No. as an omitted value rather than a unique identifier", () => {
    expect(assetNumberPlaceholderSql).toContain("set asset_number = null");
    expect(assetNumberPlaceholderSql).toContain("drop index if exists public.bm_equipment_asset_unique");
    expect(assetNumberPlaceholderSql).toContain("and trim(asset_number) <> '-'");
  });

  it("stores plan due months as their final calendar day for reminder calculations", () => {
    expect(planDueMonthSql).toContain("normalize_equipment_plan_due_month");
    expect(planDueMonthSql).toContain("before insert or update of next_due_on");
    expect(planDueMonthSql).toContain("interval '1 month - 1 day'");
  });
});
