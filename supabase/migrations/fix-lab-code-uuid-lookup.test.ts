import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260902051127_fix_lab_code_uuid_lookup.sql"),
  "utf8",
);

describe("LAB-code UUID lookup fix", () => {
  it("does not use an unsupported min(uuid) aggregate for new codes", () => {
    expect(sql).not.toMatch(/min\s*\(\s*id\s*\)/i);
    expect(sql).toContain("select count(*)::integer into v_existing_count");
    expect(sql).toMatch(/order by id\s+limit 1\s+for update/i);
  });
});
