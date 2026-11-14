// Pure planning/validation for saving many manufacturer (assigned) Mean/SD
// values of one control lot at once. The server still writes each row through
// the same single-spec path so the revision trigger, chart recalculation and
// audit entry behave exactly as with the one-at-a-time form.

export type SpecBatchItem = {
  analyteId: string
  assignedMean: number
  assignedSd: number
}

export type SpecBatchExisting = {
  controlLotId: string
  analyteId: string
  assignedMean: number | null
  assignedSd: number | null
}

export type SpecBatchAnalyte = {
  id: string
  code: string
  dataType: 'quantitative' | 'qualitative'
  isActive: boolean
}

export type SpecBatchPlan =
  | { ok: true, rows: Array<SpecBatchItem & { isChange: boolean }> }
  | { ok: false, error: string }

export function isAssignedSpecAnalyte(analyte: SpecBatchAnalyte | undefined) {
  return Boolean(analyte && analyte.isActive && analyte.dataType === 'quantitative' && !/-VL\b/i.test(analyte.code))
}

export function planSpecBatch(input: {
  controlLotId: string
  items: SpecBatchItem[]
  existing: SpecBatchExisting[]
  analytes: SpecBatchAnalyte[]
  changeReason?: string | null
}): SpecBatchPlan {
  if (!input.items.length) return { ok: false, error: 'ไม่มีค่า Mean/SD ที่ต้องบันทึก' }
  const analytes = new Map(input.analytes.map((analyte) => [analyte.id, analyte]))
  const seen = new Set<string>()
  const rows: Array<SpecBatchItem & { isChange: boolean }> = []
  for (const item of input.items) {
    const analyte = analytes.get(item.analyteId)
    if (!isAssignedSpecAnalyte(analyte)) return { ok: false, error: `Analyte ${analyte?.code ?? item.analyteId} ไม่ใช่ CD4 quantitative ที่ใช้ Mean/SD จากผู้ผลิต` }
    if (seen.has(item.analyteId)) return { ok: false, error: `Analyte ${analyte!.code} ซ้ำในรายการ` }
    seen.add(item.analyteId)
    if (!Number.isFinite(item.assignedMean)) return { ok: false, error: `${analyte!.code}: Assigned mean ต้องเป็นตัวเลข` }
    if (!Number.isFinite(item.assignedSd) || item.assignedSd <= 0) return { ok: false, error: `${analyte!.code}: Assigned SD ต้องมากกว่า 0` }
    const current = input.existing.find((spec) => spec.controlLotId === input.controlLotId && spec.analyteId === item.analyteId)
    // Mirrors upsertSpec: any existing spec row whose values differ counts as
    // a change and therefore needs a reason (even if the old values were null).
    const unchanged = current != null && current.assignedMean === item.assignedMean && current.assignedSd === item.assignedSd
    if (unchanged) continue
    rows.push({ ...item, isChange: current != null })
  }
  if (!rows.length) return { ok: false, error: 'ค่า Mean/SD ไม่มีการเปลี่ยนแปลง' }
  if (rows.some((row) => row.isChange) && !input.changeReason?.trim()) return { ok: false, error: 'ระบุเหตุผลเมื่อแก้ไข Mean/SD เดิม' }
  return { ok: true, rows }
}

/**
 * VL control kits use HPC / LPC levels (or say VL in the material name). Their
 * targets come from the QC baseline, so they never need manufacturer CD4 Mean/SD.
 */
export function isVlControlLot(lot: { controlMaterialName: string, level: string | null }) {
  return /\bVL\b|HPC|LPC/i.test(`${lot.controlMaterialName} ${lot.level ?? ''}`)
}
