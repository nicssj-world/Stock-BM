import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/iqc-view.tsx'), 'utf8')

describe('IQC chart corrective action links', () => {
  it('lets a selected chart point open its linked corrective action', () => {
    expect(source).toContain('linkedCorrectiveAction')
    expect(source).toContain('ไปยัง Corrective action')
    expect(source).toContain('corrective-action-${focusId}')
  })
})
