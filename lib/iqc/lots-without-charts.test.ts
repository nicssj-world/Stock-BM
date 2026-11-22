import { describe, expect, it } from 'vitest'
import { activeLotsAwaitingFirstResult } from '@/lib/iqc/lots-without-charts'
import type { IqcControlLot } from '@/lib/iqc/types'

function lot(id: string, name: string, level: string | null, isActive = true): IqcControlLot {
  return { id, controlMaterialId: `m-${id}`, controlMaterialName: name, level, lotNumber: id, expiryDate: null, stockLotId: null, isActive, lockedAt: null, lockedByName: null, lockOverrideReason: null }
}

const lots = [
  lot('hbv-pos', 'HBV-VL Control', 'HPC/LPC'),
  lot('hbv-neg', 'HBV-VL Control', 'Normal'),
  lot('hcv-pos', 'HCV-VL Control', 'HPC/LPC'),
  lot('cd4', 'BD Multi-Check CD4 Low Control', 'Low'),
  lot('old', 'HIV-VL Control', 'HPC/LPC', false),
]

describe('activeLotsAwaitingFirstResult', () => {
  it('skips Normal lots, inactive lots and lots that already have a chart', () => {
    expect(activeLotsAwaitingFirstResult(lots, [{ controlLotId: 'hbv-pos' }]).map((l) => l.id)).toEqual(['hcv-pos', 'cd4'])
  })

  it('ignores the test-set filter when deciding whether a lot has data', () => {
    expect(activeLotsAwaitingFirstResult(lots, [{ controlLotId: 'hcv-pos' }], 'HBV-VL').map((l) => l.id)).toEqual(['hbv-pos'])
  })

  it('matches panel test sets to their material name', () => {
    expect(activeLotsAwaitingFirstResult(lots, [], 'CD4 Low Panel').map((l) => l.id)).toEqual(['cd4'])
  })
})
