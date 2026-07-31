import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/eqa-view.tsx'), 'utf8')
const selectScheme = view.match(/function selectScheme\(schemeId: string\) \{([\s\S]*?)\n  \}/)?.[1] ?? ''

describe('EQA plan item scheme selection', () => {
  it('keeps the new-plan form collapsed until the user asks to add an item', () => {
    expect(view).toContain('const [showForm, setShowForm] = useState(Boolean(editing))')
    expect(view).toContain("onClick={() => setShowForm(!showForm)}")
    expect(view).toContain("showForm ? 'ซ่อนฟอร์มเพิ่มรายการ' : 'เพิ่มรายการในแผน'")
    expect(view).toContain('{showForm || editing ? <form')
  })

  it('replaces stable scheme-derived values without filling the year-specific sample set name', () => {
    expect(selectScheme).toContain('projectName: scheme?.name || \'\'')
    expect(selectScheme).toContain('providerName: scheme?.providerName || \'\'')
    expect(selectScheme).not.toContain('sampleSetName:')
    expect(selectScheme).toContain('externalCode: scheme?.code || \'\'')
    expect(selectScheme).toContain('testItem: scheme?.analyteScope || \'\'')
    expect(selectScheme).toContain("expectedRounds: scheme?.roundsPerYear ? String(scheme.roundsPerYear) : ''")
    expect(selectScheme).not.toMatch(/current\.(projectName|providerName|sampleSetName|testItem|expectedRounds) \|\|/)
  })
})
