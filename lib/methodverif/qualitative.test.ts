import { describe, expect, it } from 'vitest'
import { classifyQualitative, qualitativeAgreement, qualitativeReproducibility, wilsonInterval } from '@/lib/methodverif/qualitative'
import { evaluateStudy } from '@/lib/methodverif/evaluate'
import { defaultComparison, defaultLinearity, defaultLod, defaultPrecision, defaultQualitative } from '@/lib/methodverif/types'

const pair = (reference: string, candidate: string, sampleLabel = '') => ({ sampleLabel, referenceResult: reference, candidateResult: candidate })
const rep = (expected: string, result: string, retest = '') => ({ sampleLabel: 'S1', replicateId: '', run: '', expected, result, retest, note: '' })

describe('classifyQualitative', () => {
  it('treats negative wording as negative and genotype calls as positive', () => {
    expect(classifyQualitative('Negative')).toBe('negative')
    expect(classifyQualitative('Target Not Detected')).toBe('negative')
    expect(classifyQualitative('TND')).toBe('negative')
    expect(classifyQualitative('HPV16+')).toBe('positive')
    expect(classifyQualitative('Other HR+')).toBe('positive')
    expect(classifyQualitative('Invalid')).toBe('invalid')
    expect(classifyQualitative('  ')).toBe('empty')
  })
})

describe('wilsonInterval', () => {
  it('gives the textbook interval for 20/20', () => {
    expect(wilsonInterval(20, 20)).toEqual({ lower: 83.9, upper: 100 })
    expect(wilsonInterval(0, 0)).toBeNull()
  })
})

describe('qualitativeAgreement', () => {
  it('counts exact category matches, ignoring case and spacing, and splits PPA / NPA', () => {
    const result = qualitativeAgreement([
      pair('HPV16+', 'hpv16+'),
      pair('Other HR+', 'OtherHR+'),
      pair('HPV18+', 'Other HR+'),
      pair('Negative', 'Negative'),
      pair('Negative', 'HPV16+'),
    ], { minSamples: 5, minAgreementPercent: 95 })
    expect(result.n).toBe(5)
    expect(result.agree).toBe(3)
    expect(result.agreementPercent).toBe(60)
    // A wrong genotype is still a positive call for PPA.
    expect(result.positiveAgree).toBe(3)
    expect(result.ppa).toBe(100)
    expect(result.negativeAgree).toBe(1)
    expect(result.npa).toBe(50)
    expect(result.verdict).toBe('failed')
  })

  it('keeps pairs aligned with the input rows and skips blank or invalid rows', () => {
    const result = qualitativeAgreement([pair('Negative', 'Negative'), pair('', ''), pair('HPV16+', 'Invalid'), pair('HPV16+', '')], { minSamples: 1, minAgreementPercent: 95 })
    expect(result.pairs.map((item) => item.category)).toEqual(['agree', 'incomplete', 'invalid', 'incomplete'])
    expect(result.n).toBe(1)
    expect(result.invalidN).toBe(1)
    expect(result.incompleteN).toBe(1)
    expect(result.verdict).toBe('passed')
  })

  it('needs the minimum number of readable samples', () => {
    const result = qualitativeAgreement([pair('Negative', 'Negative')], { minSamples: 20, minAgreementPercent: 95 })
    expect(result.verdict).toBe('insufficient')
  })
})

describe('qualitativeReproducibility', () => {
  it('judges the final result but always reports the first pass', () => {
    const result = qualitativeReproducibility([
      rep('Other HR+', 'Other HR+'),
      rep('Other HR+', 'Negative', 'Other HR+'),
      rep('Other HR+', 'Other HR+'),
      rep('Other HR+', 'Other HR+'),
    ], 95)
    expect(result.n).toBe(4)
    expect(result.firstMatch).toBe(3)
    expect(result.firstPercent).toBe(75)
    expect(result.finalMatch).toBe(4)
    expect(result.finalPercent).toBe(100)
    expect(result.retestedN).toBe(1)
    expect(result.verdict).toBe('passed')
    expect(result.samples).toEqual([{ sampleLabel: 'S1', expected: 'Other HR+', n: 4, firstMatch: 3, finalMatch: 4 }])
  })

  it('fails when the final result still disagrees', () => {
    const result = qualitativeReproducibility([rep('HPV18+', 'HPV18+'), rep('HPV18+', 'Negative')], 95)
    expect(result.verdict).toBe('failed')
  })
})

describe('evaluateStudy with the qualitative section', () => {
  const base = { scale: 'linear' as const, precision: defaultPrecision(), lod: defaultLod(), linearity: defaultLinearity('linear'), comparison: defaultComparison('linear') }

  it('passes on agreement alone when no reproducibility is entered', () => {
    const qualitative = { ...defaultQualitative(), minSamples: 2, samples: [pair('HPV16+', 'HPV16+'), pair('Negative', 'Negative')] }
    const evaluation = evaluateStudy({ ...base, requiredSections: ['qualitative'], qualitative })
    expect(evaluation.sections.qualitative.verdict).toBe('passed')
    expect(evaluation.overall).toBe('passed')
  })

  it('fails the section when reproducibility fails', () => {
    const qualitative = { ...defaultQualitative(), minSamples: 1, samples: [pair('HPV16+', 'HPV16+')], reproducibility: [rep('HPV16+', 'Negative')] }
    const evaluation = evaluateStudy({ ...base, requiredSections: ['qualitative'], qualitative })
    expect(evaluation.sections.qualitative.verdict).toBe('failed')
  })

  it('is insufficient for older records with no qualitative data', () => {
    const evaluation = evaluateStudy({ ...base, requiredSections: ['qualitative'] })
    expect(evaluation.sections.qualitative.verdict).toBe('insufficient')
  })
})
