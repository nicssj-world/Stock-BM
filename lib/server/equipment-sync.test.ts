import { describe, expect, it } from "vitest";
import {
  buildSyncOperations,
  matchPortalEquipment,
  type LocalEquipmentIdentity,
} from "../equipment/sync-matching";
import type { PortalEquipment } from "./equipment-sync";

const portal = (overrides: Partial<PortalEquipment> = {}): PortalEquipment => ({
  portal_equipment_id: "00000000-0000-0000-0000-000000000001",
  department_code: "BIOMOLECULAR",
  department_name: "งานอณูชีววิทยา",
  equipment_type: "Analyzer",
  cbh_code: "LAB-BM-15-002",
  hospital_asset_no: "ASSET-001",
  serial_number: "SN-001",
  manufacturer: "Vendor",
  model: "Model 1",
  vendor: "Vendor",
  portal_status: "Active",
  portal_location: "BM",
  portal_updated_at: "2026-09-01T00:00:00.000Z",
  pm_cal_summary: [],
  portal_url: null,
  portal_photo_url: null,
  ...overrides,
});

const local = (overrides: Partial<LocalEquipmentIdentity> = {}): LocalEquipmentIdentity => ({
  id: "10000000-0000-0000-0000-000000000001",
  portal_equipment_id: null,
  code: "LAB-BM-15-002",
  asset_number: "ASSET-001",
  serial_number: "SN-001",
  sync_state: "unlinked",
  status: "active",
  ...overrides,
});

describe("Portal equipment matching", () => {
  it("uses the LAB code before the Portal UUID", () => {
    const result = matchPortalEquipment(
      portal(),
      [
        local({ portal_equipment_id: "00000000-0000-0000-0000-000000000001", code: "OLD-CODE" }),
        local({ id: "10000000-0000-0000-0000-000000000002" }),
      ],
    );

    expect(result).toEqual({
      localEquipmentId: "10000000-0000-0000-0000-000000000002",
      matchedBy: "code",
      issue: null,
    });
  });

  it("matches a legacy row by an exact code, asset number, or serial", () => {
    expect(matchPortalEquipment(portal(), [local()]).matchedBy).toBe("code");
    expect(
      matchPortalEquipment(
        portal({ cbh_code: null, hospital_asset_no: "ASSET-001" }),
        [local()],
      ).matchedBy,
    ).toBe("asset_number");
    expect(
      matchPortalEquipment(
        portal({ cbh_code: null, hospital_asset_no: null, serial_number: "SN-001" }),
        [local()],
      ).matchedBy,
    ).toBe("serial_number");
  });

  it("sends duplicate identities to review instead of guessing", () => {
    const result = matchPortalEquipment(portal(), [
      local(),
      local({ id: "10000000-0000-0000-0000-000000000002" }),
    ]);

    expect(result.localEquipmentId).toBeNull();
    expect(result.issue?.issue_type).toBe("ambiguous_match");
    expect(result.issue?.candidate_local_ids).toHaveLength(2);
  });

  it("uses LAB code when older identifiers point to another legacy row", () => {
    const conflict = matchPortalEquipment(
      portal({ cbh_code: "CODE-A", hospital_asset_no: "ASSET-B", serial_number: null }),
      [
        local({ id: "10000000-0000-0000-0000-000000000001", code: "CODE-A", asset_number: null }),
        local({ id: "10000000-0000-0000-0000-000000000002", code: "CODE-B", asset_number: "ASSET-B" }),
      ],
    );
    expect(conflict).toEqual({
      localEquipmentId: "10000000-0000-0000-0000-000000000001",
      matchedBy: "code",
      issue: null,
    });

    const linkedElsewhere = matchPortalEquipment(portal(), [
      local({ portal_equipment_id: "00000000-0000-0000-0000-000000000099" }),
    ]);
    expect(linkedElsewhere.issue?.issue_type).toBe("identity_conflict");
  });

  it("allows a genuinely new Portal UUID to create a local row", () => {
    const result = matchPortalEquipment(
      portal({ cbh_code: "NEW", hospital_asset_no: null, serial_number: null }),
      [],
    );
    expect(result).toEqual({ localEquipmentId: null, matchedBy: null, issue: null });
  });

  it("turns duplicate Portal claims into issues and keeps unclaimed legacy rows in review", () => {
    const first = portal();
    const second = portal({ portal_equipment_id: "00000000-0000-0000-0000-000000000002" });
    const legacy = local({
      id: "10000000-0000-0000-0000-000000000003",
      code: "LEGACY-ONLY",
      asset_number: null,
      serial_number: null,
    });
    const result = buildSyncOperations([first, second], [local(), legacy]);

    expect(result.operations.every((operation) => operation.issue?.issue_type === "identity_conflict")).toBe(true);
    expect(result.unmatchedLocalIds).toEqual([legacy.id]);
  });
});

describe("Portal equipment photo contract", () => {
  it("keeps a server-only signed photo URL out of the identity matcher", () => {
    const operations = buildSyncOperations([portal({
      portal_photo_url: "https://portal.example.test/storage/equipment/photo.jpg?token=temporary",
    })], [local()]);

    expect(operations.operations[0].portal.portal_photo_url).toContain("token=temporary");
    expect(operations.operations[0].local_equipment_id).toBe(local().id);
  });
});
