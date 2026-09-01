import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const route = readFileSync(join(process.cwd(), 'app/api/equipment/routine-maintenance/route.ts'), 'utf8')
const qrRoute = readFileSync(join(process.cwd(), 'app/api/equipment/routine-maintenance/qr/[token]/route.ts'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/server/routine-maintenance.ts'), 'utf8')

describe('routine maintenance API boundary', () => {
  it('exposes the generic form, logging, exception, review, and deletion actions', () => {
    for (const action of ['create-form', 'update-form', 'deactivate-form', 'log', 'set-holiday', 'delete-holiday', 'review', 'unlock', 'delete-entry']) expect(route).toContain(`z.literal('${action}')`)
    expect(route).toContain('requireActor')
    expect(service).toContain('actorCanBackfill')
    expect(service).toContain('assertUnlocked')
    expect(service).toContain('routineOccurrenceForPlannedDate')
  })

  it('requires authentication and idempotency for QR writes', () => {
    expect(qrRoute).toContain('requireActor')
    expect(qrRoute).toContain('idempotencyKey: z.string().uuid()')
    expect(qrRoute).toContain("source: 'qr'")
    expect(service).toContain("source === 'qr' && !input.idempotencyKey")
  })
})
