import type { IqcAnalyte, IqcControlPlan } from '@/lib/iqc/types'
import { parseTestSets } from '@/lib/iqc/test-sets'

export function getIqcControlPlanScope(analytes: IqcAnalyte[], controlPlans: IqcControlPlan[], instrumentId: string) {
  const activeAnalytes = analytes.filter((analyte) => analyte.isActive)
  const activePlans = controlPlans.filter((plan) => plan.isActive && plan.instrumentId === instrumentId)
  const activeAnalyteIds = new Set(activeAnalytes.map((analyte) => analyte.id))
  const plannedAnalyteIds = new Set(activePlans.map((plan) => plan.analyteId).filter((analyteId) => activeAnalyteIds.has(analyteId)))
  const scopedAnalytes = plannedAnalyteIds.size
    ? activeAnalytes.filter((analyte) => plannedAnalyteIds.has(analyte.id))
    : activeAnalytes
  const testSets = [...new Set(scopedAnalytes.flatMap((analyte) => parseTestSets(analyte.groupLabel)))].sort()

  return {
    analytes: scopedAnalytes,
    testSets,
    hasPlans: plannedAnalyteIds.size > 0,
  }
}
