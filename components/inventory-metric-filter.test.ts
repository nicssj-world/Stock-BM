import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const inventory = readFileSync(join(process.cwd(), 'components/inventory-view.tsx'), 'utf8')
const shell = readFileSync(join(process.cwd(), 'components/stock-module-shell.tsx'), 'utf8')

describe('inventory metric filters', () => {
  it('uses the summary cards to filter the inventory list', () => {
    expect(inventory).toContain("filterByStatus('low')")
    expect(inventory).toContain("filterByStatus('expiring')")
    expect(inventory).toContain("filterByStatus('expired')")
    expect(shell).toContain('aria-pressed={active}')
  })
})
