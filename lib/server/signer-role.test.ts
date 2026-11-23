import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The Signer role is denied by default: requireActor rejects it, and only the
// routes a Signer needs opt in with requireAnyActor / requireSigningActor.
const SIGNER_API_ROUTES = new Set([
  'app/api/attachments/route.ts',
  'app/api/attachments/[id]/route.ts',
  'app/api/eqa/documents/[type]/[id]/approvals/route.ts',
  'app/api/me/signature/route.ts',
  'app/api/vendors/signer/route.ts',
])

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? routes(path) : name === 'route.ts' ? [path.replaceAll('\\', '/')] : []
  })
}

describe('Signer role', () => {
  it('is rejected by requireActor', () => {
    const auth = readFileSync('lib/server/auth.ts', 'utf8')
    const body = auth.slice(auth.indexOf('export async function requireActor()'), auth.indexOf('export async function requireStockAdmin()'))
    expect(body).toContain('await requireAnyActor()')
    expect(body).toContain("if (actor.role === 'Signer') throw")
  })

  it('reaches only the allow-listed API routes', () => {
    const opened = routes('app/api').filter((path) => /requireAnyActor|requireSigningActor/.test(readFileSync(path, 'utf8')))
    expect(opened.sort()).toEqual([...SIGNER_API_ROUTES].sort())
  })

  it('has no direct table access in the database', () => {
    const migration = readFileSync('supabase/migrations/202611230002_stock_signer_role.sql', 'utf8')
    expect(migration).toContain("and access.role <> 'Signer'")
  })
})
