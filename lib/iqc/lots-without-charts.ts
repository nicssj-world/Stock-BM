import type { IqcControlLot } from '@/lib/iqc/types'

function isNormalLevel(level: string | null) {
  return /^\s*normal\s*$/i.test(level ?? '')
}

function testSetKeyword(testSet: string) {
  return testSet.replace(/\s*panel\s*$/i, '').trim().toLowerCase()
}

// Active lots that still have no result at all. Normal (negative) lots are left out
// because their qualitative results never produce an LJ chart, and a test-set filter
// narrows the list to lots whose material belongs to that test set.
export function activeLotsAwaitingFirstResult(
  lots: IqcControlLot[],
  allCharts: { controlLotId: string }[],
  testSet: string = 'all',
) {
  const lotsWithCharts = new Set(allCharts.map((chart) => chart.controlLotId))
  const keyword = testSet === 'all' ? '' : testSetKeyword(testSet)
  return lots.filter((lot) =>
    lot.isActive
    && !isNormalLevel(lot.level)
    && !lotsWithCharts.has(lot.id)
    && (!keyword || lot.controlMaterialName.toLowerCase().includes(keyword)),
  )
}
