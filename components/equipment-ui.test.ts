import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const view = readFileSync(
  join(process.cwd(), "components/equipment-view.tsx"),
  "utf8",
);
const publicForm = readFileSync(
  join(process.cwd(), "components/equipment-public-form.tsx"),
  "utf8",
);
const signature = readFileSync(
  join(process.cwd(), "components/signature-pad.tsx"),
  "utf8",
);
const shell = readFileSync(
  join(process.cwd(), "components/app-shell.tsx"),
  "utf8",
);
const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

describe("equipment interface", () => {
  it("provides the five planned work areas and management actions", () => {
    for (const tab of ["overview", "registry", "plans", "history", "pending"])
      expect(view).toContain(`key: "${tab}"`);
    expect(view).toContain("ลบเครื่องมือ");
    expect(view).toContain("สร้าง QR token ใหม่");
    expect(view).toContain("แก้ไขข้อมูล");
  });

  it("provides a no-login mobile service workflow with two signatures", () => {
    expect(publicForm).toContain("technicianSignature");
    expect(publicForm).toContain("receiverSignature");
    expect(publicForm).toContain("idempotencyKey.current");
    expect(signature).toContain("devicePixelRatio");
    expect(signature).toContain("onPointerDown");
  });

  it("adds protected navigation while leaving the public service route outside the matcher", () => {
    expect(shell).toContain("href: '/equipment'");
    expect(proxy).toContain("'/equipment/:path*'");
    expect(proxy).not.toContain("'/service/equipment/:path*'");
  });
});
