import { describe, expect, it } from 'vitest'
import { vendorFiscalYearBounds, vendorFiscalYearFor, vendorFiscalYearLabel } from './fiscal-year'

describe('vendor fiscal year', () => {
  it('uses October through September and names the year by its ending calendar year', () => {
    expect(vendorFiscalYearFor('2026-09-30')).toBe('2026')
    expect(vendorFiscalYearFor('2026-10-01')).toBe('2027')
    expect(vendorFiscalYearBounds('2027')).toEqual({ from: '2026-10-01', to: '2027-09-30' })
    expect(vendorFiscalYearLabel('2027')).toBe('พ.ศ. 2570')
  })
})
