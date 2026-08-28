import { describe, expect, it } from 'vitest'
import { getIqcControlPlanScope } from '@/lib/iqc/control-plan-scope'
import type { IqcAnalyte, IqcControlPlan } from '@/lib/iqc/types'

const analytes = [
  { id: 'analyte-hbv', code: 'HBV-VL (HPC)', name: 'HBV HPC', dataType: 'quantitative', scale: 'log10', isAbsolute: false, unit: 'IU/mL', groupLabel: 'HIV-VL', isActive: true },
  { id: 'analyte-hcv', code: 'HCV-VL (HPC)', name: 'HCV HPC', dataType: 'quantitative', scale: 'log10', isAbsolute: false, unit: 'IU/mL', groupLabel: 'HIV-VL', isActive: true },
  { id: 'analyte-cd3', code: '%CD3', name: 'CD3', dataType: 'quantitative', scale: 'linear', isAbsolute: false, unit: '%', groupLabel: 'CD4 Low Panel | COE Panel', isActive: true },
  { id: 'analyte-cd4', code: '%CD4', name: 'CD4', dataType: 'quantitative', scale: 'linear', isAbsolute: false, unit: '%', groupLabel: 'CD4 Low Panel | COE Panel', isActive: true },
  { id: 'analyte-inactive', code: 'TB-VL (HPC)', name: 'Inactive TB', dataType: 'quantitative', scale: 'log10', isAbsolute: false, unit: 'IU/mL', groupLabel: 'TB-VL', isActive: false },
] satisfies IqcAnalyte[]

const plans = [
  { id: 'plan-cd3', analyteId: 'analyte-cd3', analyteCode: '%CD3', analyteName: 'CD3', instrumentId: 'instrument-a', instrumentName: 'Flow A', requiredLevels: [], frequency: 'per-run', westgardRules: ['1-2s'], policyProfile: 'cd4-legacy', isActive: true },
  { id: 'plan-cd4', analyteId: 'analyte-cd4', analyteCode: '%CD4', analyteName: 'CD4', instrumentId: 'instrument-a', instrumentName: 'Flow A', requiredLevels: [], frequency: 'per-run', westgardRules: ['1-2s'], policyProfile: 'cd4-legacy', isActive: true },
  { id: 'plan-hbv', analyteId: 'analyte-hbv', analyteCode: 'HBV-VL (HPC)', analyteName: 'HBV HPC', instrumentId: 'instrument-b', instrumentName: 'Cobas B', requiredLevels: ['HPC'], frequency: 'daily', westgardRules: ['1-2s'], policyProfile: 'vl-standard-v1', isActive: true },
] satisfies IqcControlPlan[]

describe('IQC control plan scope', () => {
  it('filters all active analytes and test sets by active plans for the selected instrument', () => {
    const scope = getIqcControlPlanScope(analytes, plans, 'instrument-a')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-cd3', 'analyte-cd4'])
    expect(scope.testSets).toEqual(['CD4 Low Panel', 'COE Panel'])
    expect(scope.hasPlans).toBe(true)
  })

  it('filters VL analytes when the selected instrument has a VL plan', () => {
    const scope = getIqcControlPlanScope(analytes, plans, 'instrument-b')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-hbv'])
    expect(scope.testSets).toEqual(['HIV-VL'])
    expect(scope.hasPlans).toBe(true)
  })

  it('shows all active analytes when the instrument has no plan yet', () => {
    const scope = getIqcControlPlanScope(analytes, plans, 'instrument-new')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-hbv', 'analyte-hcv', 'analyte-cd3', 'analyte-cd4'])
    expect(scope.testSets).toEqual(['CD4 Low Panel', 'COE Panel', 'HIV-VL'])
    expect(scope.hasPlans).toBe(false)
  })
})
