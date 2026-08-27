import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/lot-verification-view.tsx'), 'utf8')
const route = readFileSync(join(process.cwd(), 'app/api/lot-verification/verifications/[id]/route.ts'), 'utf8')
const service = readFileSync(join(process.cwd(), 'lib/server/lotverif.ts'), 'utf8')

describe('lot verification actions', () => {
  it('provides edit and delete controls with a protected delete endpoint', () => {
    expect(view).toContain('Pencil')
    expect(view).toContain('Trash2')
    expect(view).toContain("method: 'DELETE'")
    expect(route).toContain('export async function DELETE')
    expect(service).toContain('export async function deleteVerification')
  })

  it('keeps finalized verification data editable and removable by Admin', () => {
    expect(view).toContain('const editable = true')
    expect(view).toContain('isAdmin && editable')
    expect(service).not.toContain("if (status === 'released' || status === 'rejected') throw new HttpError(409")
  })

  it('guards Parallel verification before release', () => {
    expect(service).toContain("if (patch.status === 'released') await assertCanRelease(id)")
  })

  it('uses only an approved instrument-scoped baseline for quantitative VL', () => {
    expect(service).toContain('function isVlQuantitativeAnalyte')
    expect(service).toContain('if (isVlQuantitativeAnalyte(analyteById.get(asString(row.analyte_id)))) return []')
    expect(service).toContain('if (!vlQuantitative) {')
    expect(service).toContain('approved QC baseline ของเครื่องมือนี้ก่อนบันทึก Parallel comparison')
    expect(view).toContain("if (vlQuantitative) return matches.find((stat) => stat.instrumentId === v.instrumentId && stat.source === 'baseline')")
  })

  it('starts finalized verification cards collapsed but keeps their details accessible', () => {
    expect(view).toContain("const [expanded, setExpanded] = useState(v.status !== 'released' && v.status !== 'rejected')")
    expect(view).toContain('aria-expanded={expanded}')
    expect(view).toContain('แสดงรายละเอียด')
  })

  it('gives the saved conclusion a prominent, semantic summary treatment', () => {
    expect(view).toContain('function isPositiveConclusion')
    expect(view).toContain('สรุปผล')
    expect(view).toContain('aria-label={`สรุปผล ${v.conclusion}`}')
  })
})
