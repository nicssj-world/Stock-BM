import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourcePath = join(process.cwd(), 'lib/server/hiv-lab-alert.ts')

describe('HIV LAB Alert server safeguards', () => {
  it('has a server-only DAL with staff authorization and masked-name boundaries', () => {
    expect(existsSync(sourcePath)).toBe(true)
    if (!existsSync(sourcePath)) return
    const source = readFileSync(sourcePath, 'utf8')
    expect(source).toContain("import 'server-only'")
    expect(source).toContain("actor.role === 'Assistant'")
    expect(source).toContain('maskPatientName')
    expect(source).not.toContain('patient_name_raw')
  })

  it('guards LINE sending against missing configuration and already-sent alerts', () => {
    expect(existsSync(sourcePath)).toBe(true)
    if (!existsSync(sourcePath)) return
    const source = readFileSync(sourcePath, 'utf8')
    expect(source).toContain('LINE_CHANNEL_ACCESS_TOKEN')
    expect(source).toContain('LINE_GROUP_ID')
    expect(source).toContain('line_sent_at')
    expect(source).toContain('X-Line-Retry-Key')
    expect(source).toContain('line_send_failed')
    expect(source).toContain('created.rack_position')
    expect(source).not.toContain('created.position')
  })

  it('exposes stored Rack occupancy and passes an optional position to the locked RPC', () => {
    expect(existsSync(sourcePath)).toBe(true)
    if (!existsSync(sourcePath)) return
    const source = readFileSync(sourcePath, 'utf8')
    expect(source).toContain('occupiedPositions')
    expect(source).toContain('isValidHivDrtPosition')
    expect(source).toContain('p_position: position')
    expect(source).toContain('no auto-fill position is available in the selected hiv drt rack')
  })
})
