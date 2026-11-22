import { describe, expect, it } from 'vitest'
import { compareInstruments, parsePastedPairs, parseResult, type CompareCriteria } from '@/lib/instcomp/compare'

const log: CompareCriteria = { scale: 'log10', biasLimit: 0.3, pairLimit: 0.5, minPairs: 3 }
const rows = (pairs: [string, string][]) => pairs.map(([referenceRaw, candidateRaw], index) => ({ rowNo: index + 1, sampleLabel: `S${index + 1}`, referenceRaw, candidateRaw }))

describe('parseResult', () => {
  it('reads cobas-style results', () => {
    expect(parseResult('1.77E+06')).toEqual({ kind: 'value', value: 1770000 })
    expect(parseResult('1,770,000 IU/mL')).toEqual({ kind: 'value', value: 1770000 })
    expect(parseResult('Target Not Detected')).toEqual({ kind: 'not-detected' })
    expect(parseResult('<20')).toEqual({ kind: 'below', limit: 20 })
    expect(parseResult('Target detected <20 cp/mL')).toEqual({ kind: 'below', limit: 20 })
    expect(parseResult('>1.0E+08')).toEqual({ kind: 'above', limit: 100000000 })
    expect(parseResult('')).toEqual({ kind: 'empty' })
    expect(parseResult('abc')).toEqual({ kind: 'invalid', raw: 'abc' })
  })
})

describe('compareInstruments', () => {
  it('computes log10 bias, limits of agreement and a pass verdict', () => {
    const { pairs, summary } = compareInstruments(rows([['1000', '1258.9'], ['10000', '10000'], ['100000', '79432.8'], ['Not detected', 'Not detected']]), log)
    expect(pairs[0].difference).toBeCloseTo(0.1, 3)
    expect(summary.quantitativeN).toBe(3)
    expect(summary.meanBias).toBeCloseTo(0, 3)
    expect(summary.sdDifference).toBeCloseTo(0.1, 3)
    expect(summary.loaUpper).toBeCloseTo(0.196, 3)
    expect(summary.bothNotDetectedN).toBe(1)
    expect(summary.concordancePercent).toBe(100)
    expect(summary.verdict).toBe('passed')
  })

  it('fails on a systematic bias beyond the limit', () => {
    const { summary } = compareInstruments(rows([['1000', '2511.9'], ['10000', '25118.9'], ['100000', '251188.6']]), log)
    expect(summary.meanBias).toBeCloseTo(0.4, 3)
    expect(summary.verdict).toBe('failed')
  })

  it('fails on detected / not-detected discordance', () => {
    const { summary } = compareInstruments(rows([['1000', '1000'], ['10000', '10000'], ['100000', '100000'], ['<20', 'Not detected']]), log)
    expect(summary.discordantN).toBe(1)
    expect(summary.verdict).toBe('failed')
  })

  it('keeps below-range detected pairs out of the quantitative statistics', () => {
    const { pairs, summary } = compareInstruments(rows([['<20', '<20'], ['1000', '1000']]), log)
    expect(pairs[0].category).toBe('detected-outside-range')
    expect(summary.quantitativeN).toBe(1)
    expect(summary.verdict).toBe('insufficient')
  })

  it('uses percent difference for linear assays', () => {
    const { pairs } = compareInstruments(rows([['100', '110']]), { scale: 'linear', biasLimit: 10, pairLimit: 20, minPairs: 1 })
    expect(pairs[0].difference).toBeCloseTo(10, 6)
  })
})

describe('parsePastedPairs', () => {
  it('reads tab-separated Excel rows and skips a header', () => {
    expect(parsePastedPairs('Sample\t8800\t6800\nA1\t1,770,000\t1.80E+06\n\t<20\tNot detected')).toEqual([
      { sampleLabel: 'A1', referenceRaw: '1,770,000', candidateRaw: '1.80E+06' },
      { sampleLabel: null, referenceRaw: '<20', candidateRaw: 'Not detected' },
    ])
  })
})
