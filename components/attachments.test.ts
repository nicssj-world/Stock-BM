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
});
