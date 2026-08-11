import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('HIV LAB Alert API contract', () => {
  it('exposes workspace/create and validates the selected Rack', () => {
    expect(source('app/api/hiv-alert/workspace/route.ts')).toContain('getHivLabAlertWorkspace')
    const create = source('app/api/hiv-alert/alerts/route.ts')
    expect(create).toContain('patientName')
    expect(create).toContain('rackId: z.string().uuid()')
    expect(create).toContain('createHivLabAlert')
  })

  it('exposes pre-send edit/delete and a separate send endpoint', () => {
    const mutation = source('app/api/hiv-alert/alerts/[id]/route.ts')
    expect(mutation).toContain('updateHivLabAlert')
    expect(mutation).toContain('deleteHivLabAlert')
    expect(source('app/api/hiv-alert/alerts/[id]/send/route.ts')).toContain('sendHivLabAlert')
  })
})
