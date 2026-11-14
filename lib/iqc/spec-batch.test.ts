import { describe, expect, it } from 'vitest'
import { isVlControlLot, planSpecBatch, type SpecBatchAnalyte } from '@/lib/iqc/spec-batch'

const LOT = 'lot-cd4-low'
const analytes: SpecBatchAnalyte[] = [
  { id: 'cd3', code: '%CD3', dataType: 'quantitative', isActive: true },
  { id: 'cd4', code: 'AbsCD4', dataType: 'quantitative', isActive: true },
  { id: 'vl', code: 'HIV-VL (HPC)', dataType: 'quantitative', isActive: true },
  { id: 'normal', code: 'HIV-VL (Normal)', dataType: 'qualitative', isActive: true },
  { id: 'old', code: '%CD8', dataType: 'quantitative', isActive: false },
]

describe('planSpecBatch', () => {
  it('accepts new rows without a reason', () => {
    const plan = planSpecBatch({ controlLotId: LOT, analytes, existing: [], items: [
      { analyteId: 'cd3', assignedMean: 70, assignedSd: 3 },
      { analyteId: 'cd4', assignedMean: 450, assignedSd: 40 },
    ] })
    expect(plan).toEqual({ ok: true, rows: [
      { analyteId: 'cd3', assignedMean: 70, assignedSd: 3, isChange: false },
      { analyteId: 'cd4', assignedMean: 450, assignedSd: 40, isChange: false },
    ] })
  })

  it('skips unchanged rows and requires a reason when an existing spec changes', () => {
    const existing = [
      { controlLotId: LOT, analyteId: 'cd3', assignedMean: 70, assignedSd: 3 },
      { controlLotId: LOT, analyteId: 'cd4', assignedMean: 450, assignedSd: 40 },
    ]
    const items = [
      { analyteId: 'cd3', assignedMean: 70, assignedSd: 3 },
      { analyteId: 'cd4', assignedMean: 460, assignedSd: 40 },
    ]
    expect(planSpecBatch({ controlLotId: LOT, analytes, existing, items })).toEqual({ ok: false, error: 'ระบุเหตุผลเมื่อแก้ไข Mean/SD เดิม' })
    expect(planSpecBatch({ controlLotId: LOT, analytes, existing, items, changeReason: 'certificate ฉบับใหม่' })).toEqual({ ok: true, rows: [
      { analyteId: 'cd4', assignedMean: 460, assignedSd: 40, isChange: true },
    ] })
  })

  it('treats an existing empty spec row as a change, like the single-row save', () => {
    const existing = [{ controlLotId: LOT, analyteId: 'cd3', assignedMean: null, assignedSd: null }]
    expect(planSpecBatch({ controlLotId: LOT, analytes, existing, items: [{ analyteId: 'cd3', assignedMean: 70, assignedSd: 3 }] }))
      .toEqual({ ok: false, error: 'ระบุเหตุผลเมื่อแก้ไข Mean/SD เดิม' })
  })

  it('ignores specs of other lots when deciding what changed', () => {
    const existing = [{ controlLotId: 'other-lot', analyteId: 'cd3', assignedMean: 70, assignedSd: 3 }]
    const plan = planSpecBatch({ controlLotId: LOT, analytes, existing, items: [{ analyteId: 'cd3', assignedMean: 70, assignedSd: 3 }] })
    expect(plan.ok && plan.rows[0].isChange).toBe(false)
  })

  it('rejects SD of zero or less and non-numeric mean', () => {
    expect(planSpecBatch({ controlLotId: LOT, analytes, existing: [], items: [{ analyteId: 'cd3', assignedMean: 70, assignedSd: 0 }] }))
      .toEqual({ ok: false, error: '%CD3: Assigned SD ต้องมากกว่า 0' })
    expect(planSpecBatch({ controlLotId: LOT, analytes, existing: [], items: [{ analyteId: 'cd3', assignedMean: Number.NaN, assignedSd: 2 }] }))
      .toEqual({ ok: false, error: '%CD3: Assigned mean ต้องเป็นตัวเลข' })
  })

  it('rejects VL, qualitative, inactive and duplicate analytes', () => {
    for (const analyteId of ['vl', 'normal', 'old']) {
      const plan = planSpecBatch({ controlLotId: LOT, analytes, existing: [], items: [{ analyteId, assignedMean: 1, assignedSd: 1 }] })
      expect(plan.ok).toBe(false)
    }
    expect(planSpecBatch({ controlLotId: LOT, analytes, existing: [], items: [
      { analyteId: 'cd3', assignedMean: 70, assignedSd: 3 },
      { analyteId: 'cd3', assignedMean: 71, assignedSd: 3 },
    ] })).toEqual({ ok: false, error: 'Analyte %CD3 ซ้ำในรายการ' })
  })

  it('reports when nothing changed', () => {
    const existing = [{ controlLotId: LOT, analyteId: 'cd3', assignedMean: 70, assignedSd: 3 }]
    expect(planSpecBatch({ controlLotId: LOT, analytes, existing, items: [{ analyteId: 'cd3', assignedMean: 70, assignedSd: 3 }] }))
      .toEqual({ ok: false, error: 'ค่า Mean/SD ไม่มีการเปลี่ยนแปลง' })
  })
})

describe('isVlControlLot', () => {
  it('matches the material naming used by the VL and CD4 import scripts', () => {
    expect(isVlControlLot({ controlMaterialName: 'HIV-VL Control', level: 'HPC/LPC' })).toBe(true)
    expect(isVlControlLot({ controlMaterialName: 'HBV-VL Control', level: 'Normal' })).toBe(true)
    expect(isVlControlLot({ controlMaterialName: 'Roche control', level: 'LPC' })).toBe(true)
    expect(isVlControlLot({ controlMaterialName: 'BD Multi-Check CD4 Low Control', level: 'Low' })).toBe(false)
    expect(isVlControlLot({ controlMaterialName: 'COE', level: 'Normal' })).toBe(false)
  })
})
