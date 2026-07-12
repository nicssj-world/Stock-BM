import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

describe('HPV sample storage interface', () => {
  it('keeps a selected specimen type while scanning samples', () => {
    expect(source).toContain('specimenType, position: selectedPosition')
    expect(source).toContain('<option value="self_collected">Self-collected</option>')
    expect(source).toContain('<option value="clinician_collected">Clinician-collected</option>')
  })

  it('shows specimen types on samples without retaining box types', () => {
    expect(source).toContain('sample.specimenType')
    expect(source).not.toContain('box.boxType')
  })
})
