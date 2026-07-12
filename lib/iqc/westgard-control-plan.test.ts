import { describe, expect, it } from 'vitest'
import { evaluateWestgard } from '@/lib/iqc/westgard'

describe('control-plan Westgard rules', () => {
  it('does not reject a point for a rule disabled by its control plan', () => {
    const evaluateWithRules = evaluateWestgard as unknown as (
      series: number[],
      mean: number,
      sd: number,
      enabledRules: string[],
    ) => ReturnType<typeof evaluateWestgard>

    const latest = evaluateWithRules([0, 4], 0, 1, ['1-2s']).at(-1)

    expect(latest).toMatchObject({ status: 'warning', violatedRules: ['1-2s'] })
  })
})
