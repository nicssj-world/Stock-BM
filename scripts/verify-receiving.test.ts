import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'scripts/verify-receiving.mjs'), 'utf8')

describe('production-safe receiving reconciliation tool', () => {
  it('requires an explicit target, read-only production confirmation, and backup reference', () => {
    expect(source).toContain('Target must be local or production')
    expect(source).toContain('--confirm-production')
    expect(source).toContain('--backup-reference')
    expect(source).toContain('BM_SUPABASE_RECONCILIATION_READONLY_KEY')
    expect(source).toContain('Production reconciliation is SELECT-only')
    expect(source).toContain('Staging is not configured')
  })

  it('captures all protected existing-stock state and feature flags', () => {
    for (const marker of ['item_integrity', 'lot_integrity', 'balances', 'transactions', 'movement_lines', 'manufacturer_barcode', 'referential_integrity', 'feature_flags']) {
      expect(source).toContain(marker)
    }
    expect(source).toContain('receiving_enabled')
    expect(source).toContain('expiry_exception_enabled')
    expect(source).toContain('Reconciliation PASS')
  })

  it('does not write to Supabase', () => {
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
  })
})
