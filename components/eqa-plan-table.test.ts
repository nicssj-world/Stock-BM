import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/eqa-view.tsx'), 'utf8')

describe('EQA annual plan table', () => {
  it('shows the project as the primary label and the year-specific sample set below it', () => {
    expect(view).toContain('ชื่อโครงการ / ชุดตัวอย่าง')
    expect(view).toContain('{item.projectName}</p>')
    expect(view).toContain('{item.sampleSetName}{item.externalCode ? ` (${item.externalCode})` : \'\'}</p>')
  })
})
