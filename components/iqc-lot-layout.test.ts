import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')

describe('IQC control-lot header layout', () => {
  it('keeps lot summary at the right of the lock controls', () => {
    expect(source).toContain('mt-3 flex flex-wrap items-center justify-between gap-3')
    expect(source).toContain('ml-auto shrink-0 text-right text-xs text-[#789097]')
  })
})
