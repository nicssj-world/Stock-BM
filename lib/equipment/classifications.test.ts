import { describe, expect, it } from "vitest"
import { EQUIPMENT_CLASSIFICATIONS, equipmentClassificationOptions, matchesEquipmentClassification } from "./classifications"

describe("equipment classifications", () => {
  it("matches the lab-management-portal classification vocabulary", () => {
    expect(EQUIPMENT_CLASSIFICATIONS).toEqual([
      "Auto Pipette",
      "BSC",
      "Microscope",
      "Calibration Weight",
      "Analyzer",
      "Analyzer (Rental)",
      "Rotator",
      "Vortex mixer",
      "Timer",
      "UPS",
      "AutoClave",
      "Centrifuge",
      "Water Bath",
      "HeatingBlock",
      "Incubator",
      "Electronic Balance",
      "Refrigerator",
      "Digital Thermometer",
      "Volumetric Pipette",
    ])
  })

  it("keeps legacy values available when editing existing equipment", () => {
    expect(equipmentClassificationOptions(["Legacy Analyzer", "BSC", null])).toContain("Legacy Analyzer")
    expect(equipmentClassificationOptions(["Legacy Analyzer", "BSC", null])[0]).toBe("Auto Pipette")
  })

  it("matches common classification labels to Portal equipment values", () => {
    expect(matchesEquipmentClassification("Analyzer", ["Analyzer (Rental)", "Analyzer, Laboratory"])).toBe(true)
    expect(matchesEquipmentClassification("BSC", [null, "Class II Biosafety Cabinet"])).toBe(true)
    expect(matchesEquipmentClassification("Refrigerator", ["Analyzer (Rental)"])).toBe(false)
  })
})
