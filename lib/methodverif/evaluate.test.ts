import { describe, expect, it } from 'vitest'
import { evaluateStudy } from '@/lib/methodverif/evaluate'
import { defaultComparison, defaultLinearity, defaultLod, defaultPrecision } from '@/lib/methodverif/types'

const base = {
  scale: 'log10' as const,
  precision: defaultPrecision(),
  lod: defaultLod(),
  linearity: defaultLinearity('log10'),
}

describe('evaluateStudy with an embedded method comparison', () => {
  it('evaluates the paired results stored in the verification record', () => {
    const samples = ['1000', '10000', '100000'].map((value, index) => ({ sampleLabel: `S${index + 1}`, referenceRaw: value, candidateRaw: value }))
    const evaluation = evaluateStudy({ ...base, requiredSections: ['comparison'], comparison: { ...defaultComparison('log10'), minPairs: 3, samples } })
    expect(evaluation.comparison.summary.quantitativeN).toBe(3)
    expect(evaluation.sections.comparison.verdict).toBe('passed')
    expect(evaluation.overall).toBe('passed')
  })

  it('needs enough pairs before the comparison can pass', () => {
    const evaluation = evaluateStudy({ ...base, requiredSections: ['comparison'], comparison: defaultComparison('log10') })
    expect(evaluation.sections.comparison.verdict).toBe('insufficient')
    expect(evaluation.overall).toBe('insufficient')
  })

  it('only counts the sections the study requires', () => {
    const evaluation = evaluateStudy({ ...base, requiredSections: ['lod'], comparison: defaultComparison('log10'), lod: { ...defaultLod(), claimedLod: 20, values: Array(20).fill('<20') } })
    expect(evaluation.overall).toBe('passed')
  })
})
