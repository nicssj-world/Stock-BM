import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/lot-verification-view.tsx'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/server/lotverif.ts'), 'utf8')

describe('Lot-to-Lot reagent selection', () => {
  it('explains that the Reagent lot picker excludes other stock categories', () => {
    expect(view).toContain('แสดงเฉพาะ Stock item หมวด Reagent ที่ยังใช้งาน')
  })

  it('filters options and rejects non-Reagent lots at the server boundary', () => {
    expect(service).toContain("stockItemCategoryName(item).trim().toLowerCase() === 'reagent'")
    expect(service).toContain('const reagentLots: LotOption[] = lots.flatMap')
    expect(service).toContain('await assertReagentStockLots')
  })
})
