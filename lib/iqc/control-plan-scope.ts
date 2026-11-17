import type { IqcAnalyte, IqcControlPlan } from '@/lib/iqc/types'
import { parseTestSets } from '@/lib/iqc/test-sets'

function collectTestSets(analytes: IqcAnalyte[]) {
  return [...new Set(analytes.flatMap((analyte) => parseTestSets(analyte.groupLabel)))].sort()
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
