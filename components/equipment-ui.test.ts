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
  it("provides the five planned work areas and Portal sync controls", () => {
    for (const tab of ["overview", "registry", "plans", "history", "pending"])
      expect(view).toContain(`key: "${tab}"`);
    expect(view).toContain("เครื่องมือ");
    expect(view).toContain("ดึงข้อมูลจาก Portal");
    expect(view).toContain('"/api/equipment/sync"');
    expect(view).toContain("สร้าง QR token ใหม่");
    expect(view).toContain("เปิดรายละเอียด Portal");
    expect(view).not.toContain("ลบเครื่องมือ");
  });

  it("selects equipment locations from the reagent stock location registry", () => {
    expect(view).toContain("สถานที่ใช้งานภายใน Stock-BM");
    expect(view).toContain("workspace.locations.map");
    expect(view).toContain("/api/equipment/items/${selected.id}/location");
  });

  it("uses the shared classification vocabulary in the form and registry filter", () => {
    expect(view).toContain('import { equipmentClassificationOptions } from "@/lib/equipment/classifications";');
    expect(view).toContain('label="Classification"');
    expect(view).toContain('value={classification}');
    expect(view).toContain('ทุก Classification');
    expect(view).toContain('ล้างตัวกรอง');
  });

  it("keeps Portal master data read-only while exposing local equipment details", () => {
    expect(view).not.toContain("equipmentCardOpen");
    expect(view).toContain('id="selected-equipment-details"');
    expect(view).toContain('aria-label="รายละเอียดเครื่องมือเพิ่มเติม"');
    expect(view).toContain("selected.photos.length");
    expect(view).toContain("เชื่อม IQC / EQA");
    expect(view).toContain("สถานที่ใช้งานภายใน Stock-BM");
    expect(view).toContain("Sync จาก Portal จะไม่เขียนทับ");
    expect(view).not.toContain("isEquipmentFormOpen");
    expect(view).not.toContain('id="equipment-form-title"');
    expect(view).toContain('role="dialog"');
    expect(view).toContain('onChanged={onAttachmentsChanged}');
    expect(view).toContain('"/api/equipment/workspace"');
  });

  it("hides IQC and EQA items already linked to the selected equipment", () => {
    expect(view).toContain("const linkedEntityIds = new Set(");
    expect(view).toContain("links.filter((link) => link.module === linkModule)");
    expect(view).toContain(".filter((item) => !linkedEntityIds.has(item.id))");
  });

  it("plans by month instead of asking users for a specific due date", () => {
    expect(view).toContain('type="month"');
    expect(view).toContain("เดือนครบกำหนดครั้งถัดไป");
    expect(view).toContain("endOfEquipmentDueMonth(e.target.value)");
    expect(view).toContain("formatEquipmentDueMonth(plan.nextDueOn)");
  });

  it("provides a no-login mobile service workflow with two signatures", () => {
    expect(publicForm).toContain("technicianSignature");
    expect(publicForm).toContain("receiverSignature");
    expect(publicForm).toContain("idempotencyKey.current");
    expect(signature).toContain("devicePixelRatio");
    expect(signature).toContain("onPointerDown");
  });

  it("prefills linked technicians on the QR form without locking manual entry", () => {
    expect(view).toContain("ทะเบียนช่างประจำเครื่อง");
    expect(view).toContain("/api/equipment/technicians");
    expect(view).toContain("เลือกช่างจากทะเบียนเครื่องมือนี้");
    expect(view).toContain("const technicians = workspace.technicians.filter");
    expect(view).toContain("function selectTechnician(id: string)");
    expect(publicForm).toContain("context.technicians.map");
    expect(publicForm).toContain("ช่างอื่น / กรอกเอง");
    expect(publicForm).toContain("ยังแก้ไขชื่อ บริษัท และเบอร์ได้");
    expect(publicForm).toContain("setTechnicianName");
  });

  it("shows Portal PM/CAL as a read-only cache and records immutable snapshots", () => {
    expect(view).toContain("PM / Calibration จาก Portal");
    expect(view).toContain("ข้อมูล Cache แบบอ่านอย่างเดียว");
    expect(view).toContain("equipmentSnapshot");
    expect(view).toContain("portalPlanId");
    expect(view).toContain("signatureByKind");
    expect(view).toContain("FormData");
    expect(view).toContain("ReasonDialog");
    expect(view).toContain('action: "resubmit"');
  });

  it("adds protected navigation while leaving the public service route outside the matcher", () => {
    expect(shell).toContain("href: '/equipment'");
    expect(proxy).toContain("'/equipment/:path*'");
    expect(proxy).not.toContain("'/service/equipment/:path*'");
  });
});
