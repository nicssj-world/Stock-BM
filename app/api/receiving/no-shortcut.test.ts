import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('receiving mutation boundary', () => {
  it('keeps ledger RPC calls out of receiving domain/UI helpers', () => {
    const files = [...sourceFiles(join(process.cwd(), 'lib/receiving')), ...sourceFiles(join(process.cwd(), 'components/receiving'))]
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(/)
    }
    const server = readFileSync(join(process.cwd(), 'lib/server/receiving.ts'), 'utf8')
    expect(server).toContain("rpc('confirm_bm_receipt'")
  })

  it('does not write legacy identity columns from the new path', () => {
    const files = [
      ...sourceFiles(join(process.cwd(), 'lib/receiving')),
      join(process.cwd(), 'lib/server/receiving.ts'),
      ...readdirSync(join(process.cwd(), 'supabase/migrations')).filter((name) => name.includes('receiving') && name.endsWith('.sql')).map((name) => join(process.cwd(), 'supabase/migrations', name)),
    ]
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toContain('manufacturer_barcode')
  })
})
