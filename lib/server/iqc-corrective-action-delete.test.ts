import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const server = readFileSync(join(process.cwd(), 'lib/server/iqc.ts'), 'utf8')
const route = readFileSync(join(process.cwd(), 'app/api/iqc/corrective-actions/[id]/route.ts'), 'utf8')

describe('IQC corrective action deletion', () => {
  it('authorizes, clears related attachments, deletes the record, and audits the action', () => {
    expect(server).toContain('export async function deleteCorrectiveAction')
    expect(server).toContain('assertAdmin(actor)')
    expect(server).toContain("deleteEntityAttachments({ module: 'iqc', entityType: 'corrective-action', entityId: id })")
    expect(server).toContain("admin.from('iqc_corrective_actions').delete().eq('id', id)")
    expect(server).toContain("'iqc.correctiveAction.delete'")
  })

  it('exposes deletion through an authenticated DELETE route', () => {
    expect(route).toContain('export async function DELETE')
    expect(route).toContain('await requireActor()')
    expect(route).toContain('deleteCorrectiveAction')
  })

  it('allows an open action to be updated through an authenticated PATCH route', () => {
    expect(server).toContain('export async function updateCorrectiveAction')
    expect(server).toContain("'iqc.correctiveAction.update'")
    expect(route).toContain('export async function PATCH')
    expect(route).toContain('updateCorrectiveAction')
  })
})
