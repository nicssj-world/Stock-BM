import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const transactionView = readFileSync(join(process.cwd(), 'components/transaction-view.tsx'), 'utf8')
const globals = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

describe('receive form mobile date field', () => {
  it('allows the native date control to shrink within the receive card', () => {
    expect(transactionView).toMatch(/type=\{item\?\.trackExpiry \? 'date' : 'text'\}[\s\S]{0,180}className="receive-expiry-date h-12 min-w-0 max-w-full text-base"/)
    expect(transactionView).toContain('<label className="block min-w-0">')
    expect(globals).toContain('input.receive-expiry-date')
    expect(globals).toContain('max-inline-size: 100%')
  })
})
