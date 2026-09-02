/**
 * Equipment classification vocabulary shared with lab-management-portal.
 * Keep the display order stable so the form and registry filter feel familiar
 * to users moving between the two projects.
 */
export const EQUIPMENT_CLASSIFICATIONS = [
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
] as const

export type EquipmentClassification = (typeof EQUIPMENT_CLASSIFICATIONS)[number]

/** Include legacy values so editing existing equipment never hides its value. */
export function equipmentClassificationOptions(values: readonly (string | null | undefined)[]) {
  const legacyValues = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  return [...new Set([...EQUIPMENT_CLASSIFICATIONS, ...legacyValues])]
}

const CLASSIFICATION_ALIASES: Record<string, readonly string[]> = {
  bsc: ["bsc", "biosafety cabinet"],
}

function normalizeClassification(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ""
}

/** Match the selected classification against the category and equipment type. */
export function matchesEquipmentClassification(
  selected: string,
  values: readonly (string | null | undefined)[],
) {
  const needle = normalizeClassification(selected)
  if (!needle) return true
  const aliases = CLASSIFICATION_ALIASES[needle] ?? [needle]
  return values.some((value) => {
    const candidate = normalizeClassification(value)
    return candidate.length > 0 && aliases.some((alias) => candidate.includes(alias))
  })
}
