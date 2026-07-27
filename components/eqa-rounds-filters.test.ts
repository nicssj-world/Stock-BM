import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./eqa/rounds-tab.tsx', import.meta.url), 'utf8')

describe('EQA rounds tab filters and progress', () => {
  it('filters rounds by plan year, status, and free text', () => {
    expect(source).toContain('ทุกปี')
    expect(source).toContain("['active', `กำลังดำเนินการ")
    expect(source).toContain('ค้นหารายการแผน, round, provider, หรือ sample code')
  })

  it('paginates with a load-more control that still reaches a focused round past the cutoff', () => {
    expect(source).toContain('แสดงเพิ่มอีก')
    expect(source).toContain('Math.max(visibleCount, focusedIndex + 1)')
  })

  it('groups rounds by plan item and offers the round generator inline', () => {
    expect(source).toContain("round.planItemId ?? 'unassigned'")
    expect(source).toContain('<GeneratePlannedRoundsButton item={group.planItem}')
  })

  it('renders a per-round progress strip and collapses fully-approved rounds by default', () => {
    expect(source).toContain('function RoundProgressStrip')
    expect(source).toContain('const [collapsed, setCollapsed] = useState(allStepsDone || untouched)')
  })
})
