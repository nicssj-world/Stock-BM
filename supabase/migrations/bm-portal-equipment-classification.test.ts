import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/202609190001_bm_portal_equipment_classification.sql",
  ),
  "utf8",
);

describe("Portal equipment classification sync migration", () => {
  it("writes Portal's classification into bm_equipment.category on create", () => {
    expect(sql).toContain("v_classification text;");
    expect(sql).toContain(
      "v_classification := nullif(trim(p_portal->>'classification'), '');",
    );
    expect(sql).toMatch(
      /insert into public\.bm_equipment \(\s*code, name, category,/,
    );
    expect(sql).toContain("v_code, v_equipment_type, v_classification,");
  });

  it("only overwrites an existing category when Portal actually sends one", () => {
    expect(sql).toContain("category = coalesce(v_classification, category),");
  });

  it("keeps the same function signature so callers do not need to change", () => {
    expect(sql).toContain(
      "create or replace function public.upsert_bm_portal_equipment(",
    );
    expect(sql).toContain("p_portal jsonb,");
    expect(sql).toContain("p_local_equipment_id uuid,");
    expect(sql).toContain("p_actor uuid");
    expect(sql).toContain(
      "grant execute on function public.upsert_bm_portal_equipment(jsonb, uuid, uuid)",
    );
  });
});
