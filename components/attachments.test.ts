import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/attachments.tsx"),
  "utf8",
);

describe("AttachmentList refresh callback", () => {
  it("notifies its owner after an upload or deletion refreshes the local list", () => {
    expect(source).toContain("onChanged?: () => void | Promise<void>");
    expect(source.match(/await onChanged\?\.\(\)/g)).toHaveLength(2);
  });

  it("opens a centered modal preview for PDF and image attachments", () => {
    expect(source).toContain("function previewKind")
    expect(source).toContain("ดูไฟล์ในหน้านี้")
    expect(source).toContain('role="dialog"')
    expect(source).toContain('fixed inset-0 z-50')
    expect(source).toContain("closeOnEscape")
    expect(source).toContain("<iframe")
  });
});
