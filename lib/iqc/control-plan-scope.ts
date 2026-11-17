import type { IqcAnalyte, IqcControlPlan, IqcInstrument } from '@/lib/iqc/types'
import { parseTestSets } from '@/lib/iqc/test-sets'

function collectTestSets(analytes: IqcAnalyte[]) {
  return [...new Set(analytes.flatMap((analyte) => parseTestSets(analyte.groupLabel)))].sort()
}

export const NO_TEST_SET_LABEL = 'ไม่ระบุ test set'

/**
 * Active plans grouped by (instrument, test set). An analyte in several test sets
 * appears under each; an analyte with none falls under NO_TEST_SET_LABEL.
 */
export function groupPlannedTestSets(analytes: IqcAnalyte[], controlPlans: IqcControlPlan[], instrumentId?: string) {
  const analyteById = new Map(analytes.map((analyte) => [analyte.id, analyte]))
  const groups = new Map<string, { instrumentId: string; instrumentName: string; testSet: string; analyteCodes: string[] }>()
  for (const plan of controlPlans) {
    if (!plan.isActive || (instrumentId && plan.instrumentId !== instrumentId)) continue
    const analyte = analyteById.get(plan.analyteId)
    const sets = parseTestSets(analyte?.groupLabel)
    for (const testSet of sets.length ? sets : [NO_TEST_SET_LABEL]) {
      const key = `${plan.instrumentId}:${testSet}`
      const group = groups.get(key) ?? { instrumentId: plan.instrumentId, instrumentName: plan.instrumentName, testSet, analyteCodes: [] }
      group.analyteCodes.push(plan.analyteCode)
      groups.set(key, group)
    }
  }
  return [...groups.values()].sort((a, b) => a.instrumentName.localeCompare(b.instrumentName) || a.testSet.localeCompare(b.testSet))
}

/** Active instruments that have no active control plan at all. */
export function instrumentsWithoutPlans<T extends Pick<IqcInstrument, 'id' | 'isActive'>>(instruments: T[], controlPlans: IqcControlPlan[]) {
  const planned = new Set(controlPlans.filter((plan) => plan.isActive).map((plan) => plan.instrumentId))
  return instruments.filter((instrument) => instrument.isActive && !planned.has(instrument.id))
}

/**
 * Scope for the control-plan setup screen. An instrument can run many test sets;
 * analytes / test sets it already has an active plan for are left out of
 * `analytes` / `testSets` and reported in `plannedAnalytes` / `plannedTestSets`.
 */
export function getIqcControlPlanScope(analytes: IqcAnalyte[], controlPlans: IqcControlPlan[], instrumentId: string) {
  const activeAnalytes = analytes.filter((analyte) => analyte.isActive)
  const activePlans = controlPlans.filter((plan) => plan.isActive && plan.instrumentId === instrumentId)
  const activeAnalyteIds = new Set(activeAnalytes.map((analyte) => analyte.id))
  const plannedAnalyteIds = new Set(activePlans.map((plan) => plan.analyteId).filter((analyteId) => activeAnalyteIds.has(analyteId)))
  const plannedAnalytes = activeAnalytes.filter((analyte) => plannedAnalyteIds.has(analyte.id))

  const unplannedAnalytes = activeAnalytes.filter((analyte) => !plannedAnalyteIds.has(analyte.id))

  return {
    // Only analytes / test sets this instrument has no plan for yet: what the setup form offers.
    analytes: unplannedAnalytes,
    testSets: collectTestSets(unplannedAnalytes),
    plannedAnalytes,
    plannedTestSets: collectTestSets(plannedAnalytes),
    hasPlans: plannedAnalyteIds.size > 0,
  }
}
