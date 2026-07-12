import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

describe('HPV sample storage interface', () => {
  it('keeps a selected specimen type while scanning samples', () => {
    expect(source).toContain('specimenType, position: selectedPosition')
    expect(source).toContain('role="group" aria-label="Specimen type"')
    expect(source).toContain("onClick={() => setSpecimenType('self_collected')}")
    expect(source).toContain("onClick={() => setSpecimenType('clinician_collected')}")
    expect(source).not.toContain('<Select value={specimenType}')
  })

  it('shows specimen types on samples without retaining box types', () => {
    expect(source).toContain('sample.specimenType')
    expect(source).not.toContain('box.boxType')
  })
})
