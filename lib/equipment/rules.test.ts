import { describe, expect, it } from "vitest";
import {
  addEquipmentInterval,
  getEquipmentDueState,
  nextEquipmentDueDate,
} from "@/lib/equipment/rules";

describe("equipment scheduling", () => {
  it("classifies reminder and overdue dates", () => {
    expect(getEquipmentDueState("2026-08-22", 30, "2026-07-23")).toBe(
      "due_soon",
    );
    expect(getEquipmentDueState("2026-08-23", 30, "2026-07-23")).toBe("normal");
    expect(getEquipmentDueState("2026-07-22", 30, "2026-07-23")).toBe(
      "overdue",
    );
  });

  it("clamps month-end and leap-year intervals", () => {
    expect(addEquipmentInterval("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(
      addEquipmentInterval(
        addEquipmentInterval("2026-01-31", 1, "month"),
        1,
        "month",
      ),
    ).toBe("2026-03-31");
    expect(addEquipmentInterval("2024-02-29", 1, "year")).toBe("2025-02-28");
  });

  it("supports completion and fixed schedules", () => {
    expect(
      nextEquipmentDueDate({
        previousDueOn: "2026-07-01",
        completedOn: "2026-07-20",
        intervalValue: 1,
        intervalUnit: "month",
        scheduleBasis: "completion_based",
      }),
    ).toBe("2026-08-20");
    expect(
      nextEquipmentDueDate({
        previousDueOn: "2026-07-01",
        completedOn: "2026-07-20",
        intervalValue: 1,
        intervalUnit: "month",
        scheduleBasis: "fixed_schedule",
      }),
    ).toBe("2026-08-01");
  });
});
