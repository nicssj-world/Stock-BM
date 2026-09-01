import { describe, expect, it } from "vitest"
import { EQUIPMENT_CLASSIFICATIONS, equipmentClassificationOptions } from "./classifications"

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
})
