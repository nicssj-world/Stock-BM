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

  it("selects equipment locations from the reagent stock location registry", () => {
    expect(view).toContain("สถานที่ (Location คลังน้ำยา)");
    expect(view).toContain("workspace.locations.map");
    expect(view).toContain("locationId: item.locationId");
  });

  it("keeps equipment details visible and opens the add form only on demand", () => {
    expect(view).not.toContain("equipmentCardOpen");
    expect(view).toContain('id="selected-equipment-details"');
    expect(view).toContain('aria-label="รายละเอียดเครื่องมือเพิ่มเติม"');
    expect(view).toContain("selected.photos.length");
    expect(view).toContain("เชื่อม IQC / EQA");
    expect(view).toContain("isEquipmentFormOpen");
    expect(view).toContain('role="dialog"');
    expect(view).toContain("setEquipmentFormOpen(true)");
    expect(view).toContain('onChanged={onAttachmentsChanged}');
    expect(view).toContain('"/api/equipment/workspace"');
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

  it("adds protected navigation while leaving the public service route outside the matcher", () => {
    expect(shell).toContain("href: '/equipment'");
    expect(proxy).toContain("'/equipment/:path*'");
    expect(proxy).not.toContain("'/service/equipment/:path*'");
  });
});
