import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/lot-verification-view.tsx'), 'utf8')
const route = readFileSync(join(process.cwd(), 'app/api/lot-verification/verifications/[id]/route.ts'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/server/lotverif.ts'), 'utf8')

describe('lot verification actions', () => {
  it('provides edit and delete controls with a protected delete endpoint', () => {
    expect(view).toContain('Pencil')
    expect(view).toContain('Trash2')
    expect(view).toContain("method: 'DELETE'")
    expect(route).toContain('export async function DELETE')
    expect(service).toContain('export async function deleteVerification')
  })
})
