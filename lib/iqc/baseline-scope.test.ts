import { describe, expect, it } from 'vitest'
import { getIqcBaselineAnalytesForLot, getIqcBaselineScope } from '@/lib/iqc/baseline-scope'
import type { IqcAnalyte, IqcWorkspace } from '@/lib/iqc/types'

const analytes = [
  { id: 'analyte-hbv', code: 'HBV-VL (HPC)', name: 'HBV HPC', dataType: 'quantitative', scale: 'log10', isAbsolute: false, unit: 'IU/mL', groupLabel: 'HBV', isActive: true },
  { id: 'analyte-hcv', code: 'HCV-VL (HPC)', name: 'HCV HPC', dataType: 'quantitative', scale: 'log10', isAbsolute: false, unit: 'IU/mL', groupLabel: 'HCV', isActive: true },
  { id: 'analyte-normal', code: 'HBV-VL (Normal)', name: 'HBV Normal', dataType: 'qualitative', scale: 'log10', isAbsolute: false, unit: null, groupLabel: 'HBV', isActive: true },
] satisfies IqcAnalyte[]

const baseData = {
  controlLots: [
    { id: 'lot-a', controlMaterialId: 'material-a', controlMaterialName: 'VL Control', level: 'HPC', lotNumber: 'A', expiryDate: null, stockLotId: null, isActive: true, lockedAt: null, lockedByName: null, lockOverrideReason: null },
    { id: 'lot-b', controlMaterialId: 'material-b', controlMaterialName: 'VL Control', level: 'HPC', lotNumber: 'B', expiryDate: null, stockLotId: null, isActive: true, lockedAt: null, lockedByName: null, lockOverrideReason: null },
    { id: 'lot-normal', controlMaterialId: 'material-normal', controlMaterialName: 'VL Control', level: 'Normal', lotNumber: 'N', expiryDate: null, stockLotId: null, isActive: true, lockedAt: null, lockedByName: null, lockOverrideReason: null },
  ],
  controlPlans: [
    { id: 'plan-a', analyteId: 'analyte-hbv', analyteCode: 'HBV-VL (HPC)', analyteName: 'HBV HPC', instrumentId: 'instrument-a', instrumentName: 'Cobas A', requiredLevels: ['HPC'], frequency: 'daily', westgardRules: ['1-2s'], policyProfile: 'vl-standard-v1', isActive: true },
    { id: 'plan-b', analyteId: 'analyte-hcv', analyteCode: 'HCV-VL (HPC)', analyteName: 'HCV HPC', instrumentId: 'instrument-b', instrumentName: 'Cobas B', requiredLevels: ['HPC'], frequency: 'daily', westgardRules: ['1-2s'], policyProfile: 'vl-standard-v1', isActive: true },
    { id: 'plan-normal', analyteId: 'analyte-normal', analyteCode: 'HBV-VL (Normal)', analyteName: 'HBV Normal', instrumentId: 'instrument-a', instrumentName: 'Cobas A', requiredLevels: ['Normal'], frequency: 'per-run', westgardRules: ['1-2s'], policyProfile: 'vl-standard-v1', isActive: true },
  ],
  runs: [
    { id: 'run-a', instrumentId: 'instrument-a', instrumentName: 'Cobas A', runNo: 1, runDatetime: '', note: null, enteredByName: null, consumables: [], results: [{ analyteId: 'analyte-hbv', analyteCode: 'HBV-VL (HPC)', analyteName: 'HBV HPC', controlLotId: 'lot-a', numericValue: 100, qualitativeValue: null, z: null, violatedRules: [], status: 'not_evaluated', isVoided: false }] },
    { id: 'run-b', instrumentId: 'instrument-b', instrumentName: 'Cobas B', runNo: 1, runDatetime: '', note: null, enteredByName: null, consumables: [], results: [{ analyteId: 'analyte-hcv', analyteCode: 'HCV-VL (HPC)', analyteName: 'HCV HPC', controlLotId: 'lot-b', numericValue: 100, qualitativeValue: null, z: null, violatedRules: [], status: 'not_evaluated', isVoided: false }] },
    { id: 'run-normal', instrumentId: 'instrument-a', instrumentName: 'Cobas A', runNo: 2, runDatetime: '', note: null, enteredByName: null, consumables: [], results: [{ analyteId: 'analyte-hbv', analyteCode: 'HBV-VL (HPC)', analyteName: 'HBV HPC', controlLotId: 'lot-normal', numericValue: 100, qualitativeValue: null, z: null, violatedRules: [], status: 'not_evaluated', isVoided: false }] },
  ],
  charts: [],
} satisfies Pick<IqcWorkspace, 'controlLots' | 'controlPlans' | 'runs' | 'charts'>

describe('IQC baseline scope', () => {
  it('filters analytes and control lots by the selected instrument plan', () => {
    const scope = getIqcBaselineScope(baseData, analytes, 'instrument-a')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-hbv'])
    expect(scope.controlLots.map((lot) => lot.id)).toEqual(['lot-a'])
  })

  it('falls back to historical instrument results when no active plan exists', () => {
    const data = { ...baseData, controlPlans: [] }
    const scope = getIqcBaselineScope(data, analytes, 'instrument-b')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-hcv'])
    expect(scope.controlLots.map((lot) => lot.id)).toEqual(['lot-b'])
  })

  it('excludes voided results from the selectable control scope', () => {
    const data = { ...baseData, runs: [{ ...baseData.runs[0], results: [{ ...baseData.runs[0].results[0], isVoided: true }] }] }
    const scope = getIqcBaselineScope(data, analytes, 'instrument-a')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-hbv'])
    expect(scope.controlLots).toHaveLength(0)
  })

  it('filters analytes by the selected control lot assay family', () => {
    const familyAnalytes = [
      ...analytes,
      { id: 'analyte-hiv-hpc', code: 'HIV-VL (HPC)', name: 'HIV HPC', dataType: 'quantitative', scale: 'log10', isAbsolute: false, unit: 'copies/mL', groupLabel: 'HIV-VL', isActive: true },
      { id: 'analyte-hiv-lpc', code: 'HIV-VL (LPC)', name: 'HIV LPC', dataType: 'quantitative', scale: 'log10', isAbsolute: false, unit: 'copies/mL', groupLabel: 'HIV-VL', isActive: true },
    ] satisfies IqcAnalyte[]

    const scoped = getIqcBaselineAnalytesForLot(
      { runs: [] },
      familyAnalytes,
      'instrument-a',
      { ...baseData.controlLots[0], id: 'lot-hiv', controlMaterialName: 'HIV-VL Control' },
    )

    expect(scoped.map((analyte) => analyte.id)).toEqual(['analyte-hiv-hpc', 'analyte-hiv-lpc'])
  })
})
