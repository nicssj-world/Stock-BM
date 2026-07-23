import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const attachments = readFileSync(
  join(process.cwd(), "lib/server/attachments.ts"),
  "utf8",
);
const route = readFileSync(
  join(process.cwd(), "app/api/attachments/[id]/route.ts"),
  "utf8",
);

describe("private attachment image cache", () => {
  it("keeps signed URLs valid beyond the browser's private redirect cache", () => {
    expect(attachments).toContain("createSignedUrl(asString(row.storage_path), 900)");
    expect(route).toContain('"Cache-Control": "private, max-age=600, stale-while-revalidate=60"');
    expect(route).toContain('Vary: "Cookie"');
  });
});
