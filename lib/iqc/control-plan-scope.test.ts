import { describe, expect, it } from 'vitest'
import { getIqcControlPlanScope, groupPlannedTestSets } from '@/lib/iqc/control-plan-scope'
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

const allActiveIds = ['analyte-hbv', 'analyte-hcv', 'analyte-cd3', 'analyte-cd4']
const allTestSets = ['CD4 Low Panel', 'COE Panel', 'HIV-VL']

describe('IQC control plan scope', () => {
  it('hides test sets the instrument already has a plan for', () => {
    const scope = getIqcControlPlanScope(analytes, plans, 'instrument-a')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-hbv', 'analyte-hcv'])
    expect(scope.testSets).toEqual(['HIV-VL'])
    expect(scope.plannedTestSets).toEqual(['CD4 Low Panel', 'COE Panel'])
    expect(scope.hasPlans).toBe(true)
  })

  it('lets an instrument with a VL plan add another test set without offering the planned analyte again', () => {
    const scope = getIqcControlPlanScope(analytes, plans, 'instrument-b')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(['analyte-hcv', 'analyte-cd3', 'analyte-cd4'])
    expect(scope.testSets).toEqual(['CD4 Low Panel', 'COE Panel', 'HIV-VL'])
    expect(scope.plannedAnalytes.map((analyte) => analyte.id)).toEqual(['analyte-hbv'])
    expect(scope.plannedTestSets).toEqual(['HIV-VL'])
    expect(scope.hasPlans).toBe(true)
  })

  it('shows all active analytes with nothing planned when the instrument has no plan yet', () => {
    const scope = getIqcControlPlanScope(analytes, plans, 'instrument-new')
    expect(scope.analytes.map((analyte) => analyte.id)).toEqual(allActiveIds)
    expect(scope.testSets).toEqual(allTestSets)
    expect(scope.plannedTestSets).toEqual([])
    expect(scope.hasPlans).toBe(false)
  })
})

describe('groupPlannedTestSets', () => {
  it('groups active plans by instrument and test set, counting an analyte under each set it belongs to', () => {
    const groups = groupPlannedTestSets(analytes, plans)
    expect(groups.map((group) => [group.instrumentName, group.testSet, group.analyteCodes])).toEqual([
      ['Cobas B', 'HIV-VL', ['HBV-VL (HPC)']],
      ['Flow A', 'CD4 Low Panel', ['%CD3', '%CD4']],
      ['Flow A', 'COE Panel', ['%CD3', '%CD4']],
    ])
  })

  it('filters by instrument and ignores inactive plans', () => {
    const inactive = plans.map((plan) => (plan.id === 'plan-cd4' ? { ...plan, isActive: false } : plan))
    expect(groupPlannedTestSets(analytes, inactive, 'instrument-a').map((group) => group.analyteCodes)).toEqual([['%CD3'], ['%CD3']])
    expect(groupPlannedTestSets(analytes, inactive, 'instrument-new')).toEqual([])
  })
})
