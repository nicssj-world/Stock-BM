import { describe, expect, it } from 'vitest'
import { calculateBaselineStats, evaluateVlScope, expectedNormalResult } from '@/lib/iqc/baseline'
import type { BaselineValue, EvaluationAnalyte, EvaluationBaseline } from '@/lib/iqc/baseline'

function value(input: Partial<BaselineValue> & Pick<BaselineValue, 'resultId' | 'runId' | 'runDatetime' | 'analyteId'>): BaselineValue {
  return {
    resultId: input.resultId,
    runId: input.runId,
    runDatetime: input.runDatetime,
    analyteId: input.analyteId,
    panel: input.panel ?? 'VL',
    numericValue: input.numericValue ?? input.statValue ?? null,
    statValue: input.statValue ?? input.numericValue ?? null,
    qualitativeValue: input.qualitativeValue ?? null,
    currentStatus: input.currentStatus ?? 'accepted',
    currentZ: input.currentZ ?? null,
    isVoided: input.isVoided ?? false,
  }
}

describe('VL baseline calculations', () => {
  it('uses all finite selected results and leaves void filtering to the candidate scope', () => {
    const stats = calculateBaselineStats([5, 6, 7], 4, 1)
    expect(stats.n).toBe(3)
    expect(stats.candidateN).toBe(4)
    expect(stats.excludedN).toBe(1)
    expect(stats.mean).toBe(6)
    expect(stats.sd).toBe(1)
  })

  it('seeds Normal from observed Not detected results', () => {
    expect(expectedNormalResult([
      value({ resultId: 'n1', runId: 'r1', runDatetime: '2026-01-01', analyteId: 'normal', qualitativeValue: 'Not detected' }),
      value({ resultId: 'n2', runId: 'r2', runDatetime: '2026-01-02', analyteId: 'normal', qualitativeValue: 'Not detected' }),
    ])).toBe('Not detected')
  })

  it('marks excluded values not evaluated and applies same-run R-4s as investigation', () => {
    const analytes = new Map<string, EvaluationAnalyte>([
      ['hpc', { id: 'hpc', dataType: 'quantitative', panel: 'VL' }],
      ['lpc', { id: 'lpc', dataType: 'quantitative', panel: 'VL' }],
    ])
    const baselines = new Map<string, EvaluationBaseline>([
      ['hpc', { id: 'b-hpc', analyteId: 'hpc', mean: 0, sd: 1, expectedQualitative: null, policyProfile: 'vl-standard-v1', rules: ['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x'] }],
      ['lpc', { id: 'b-lpc', analyteId: 'lpc', mean: 0, sd: 1, expectedQualitative: null, policyProfile: 'vl-standard-v1', rules: ['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x'] }],
    ])
    const results = evaluateVlScope({
      values: [
        value({ resultId: 'hpc-1', runId: 'run-1', runDatetime: '2026-01-01T00:00:00Z', analyteId: 'hpc', statValue: 2.3 }),
        value({ resultId: 'lpc-1', runId: 'run-1', runDatetime: '2026-01-01T00:00:00Z', analyteId: 'lpc', statValue: -2.3 }),
        value({ resultId: 'hpc-2', runId: 'run-2', runDatetime: '2026-01-02T00:00:00Z', analyteId: 'hpc', statValue: 0, currentStatus: 'rejected' }),
        value({ resultId: 'hpc-void', runId: 'run-3', runDatetime: '2026-01-03T00:00:00Z', analyteId: 'hpc', statValue: 0, isVoided: true }),
      ],
      analytes,
      baselines,
      includedResultIds: new Set(['hpc-1', 'lpc-1', 'hpc-2']),
    })
    expect(results.get('hpc-1')?.status).toBe('investigate')
    expect(results.get('lpc-1')?.status).toBe('investigate')
    expect(results.get('hpc-2')?.status).toBe('accepted')
    expect(results.has('hpc-void')).toBe(false)
    const excluded = evaluateVlScope({ values: [value({ resultId: 'excluded', runId: 'r', runDatetime: '2026-01-01', analyteId: 'hpc', statValue: 0 })], analytes, baselines, includedResultIds: new Set() })
    expect(excluded.get('excluded')?.status).toBe('not_evaluated')
  })

  it('evaluates all six quantitative VL levels and three Normal analytes', () => {
    const quantitative = [
      ['HIV-VL (HPC)', 5.0685, 0.0707],
      ['HIV-VL (LPC)', 2.3908, 0.0941],
      ['HBV-VL (HPC)', 6.2983, 0.0612],
      ['HBV-VL (LPC)', 2.3129, 0.0610],
      ['HCV-VL (HPC)', 6.2348, 0.0443],
      ['HCV-VL (LPC)', 2.2880, 0.0963],
    ] as const
    const analytes = new Map<string, EvaluationAnalyte>()
    const baselines = new Map<string, EvaluationBaseline>()
    const values: BaselineValue[] = []
    const includedResultIds = new Set<string>()
    for (const [index, [code, targetMean, targetSd]] of quantitative.entries()) {
      const analyteId = `q-${index}`
      analytes.set(analyteId, { id: analyteId, code, dataType: 'quantitative', panel: code.split(' ')[0] })
      baselines.set(analyteId, { id: `b-${analyteId}`, analyteId, mean: targetMean, sd: targetSd, expectedQualitative: null, policyProfile: 'vl-standard-v1', rules: ['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x'] })
      for (let run = 0; run < 20; run += 1) {
        const resultId = `${analyteId}-${run}`
        includedResultIds.add(resultId)
        values.push(value({ resultId, runId: `run-${resultId}`, runDatetime: `2026-01-${String(run + 1).padStart(2, '0')}T00:00:00Z`, analyteId, statValue: targetMean + targetSd * ((run % 4) - 1.5) / 2 }))
      }
    }
    for (const [index, code] of ['HIV-VL (Normal)', 'HBV-VL (Normal)', 'HCV-VL (Normal)'].entries()) {
      const analyteId = `n-${index}`
      analytes.set(analyteId, { id: analyteId, code, dataType: 'qualitative', panel: code.split(' ')[0] })
      baselines.set(analyteId, { id: `b-${analyteId}`, analyteId, mean: null, sd: null, expectedQualitative: 'Not detected', policyProfile: 'vl-standard-v1', rules: ['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x'] })
      for (let run = 0; run < 20; run += 1) {
        const resultId = `${analyteId}-${run}`
        includedResultIds.add(resultId)
        values.push(value({ resultId, runId: `run-${resultId}`, runDatetime: `2026-02-${String(run + 1).padStart(2, '0')}T00:00:00Z`, analyteId, statValue: null, numericValue: null, qualitativeValue: 'Not detected' }))
      }
    }

    const evaluated = evaluateVlScope({ values, analytes, baselines, includedResultIds })
    expect(evaluated).toHaveLength(180)
    expect([...evaluated.values()].every((result) => result.status === 'accepted')).toBe(true)
    expect([...evaluated.values()].every((result) => result.z == null || Math.abs(result.z) < 2)).toBe(true)
  })
})
