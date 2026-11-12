import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const sql = read('supabase/migrations/202611120001_portal_equipment_references.sql')

describe('Portal equipment references for archived Stock-BM equipment', () => {
  it('keeps Portal as the master and preserves archived equipment histories', () => {
    expect(sql).toContain('create table if not exists public.bm_portal_equipment_refs')
    expect(sql).toContain('create table if not exists public.bm_portal_equipment_links')
    expect(sql).toContain('where portal_equipment_id is not null')
    expect(sql).not.toMatch(/drop table(?: if exists)? public\.bm_equipment\b/i)
    expect(sql).toContain('on conflict do nothing')
  })

  it('keeps new reference tables private and makes link changes transactional', () => {
    expect(sql).toContain('alter table public.bm_portal_equipment_refs enable row level security')
    expect(sql).toContain('alter table public.bm_portal_equipment_links enable row level security')
    expect(sql).toContain('revoke all on public.bm_portal_equipment_refs from public, anon, authenticated')
    expect(sql).toContain('create or replace function public.replace_bm_portal_equipment_links')
    expect(sql).toContain('security invoker')
    expect(sql).toContain("p_module not in ('iqc','eqa','stock')")
    expect(sql).toContain('bm_portal_iqc_one_equipment')
    expect(sql).toContain('VL baseline guard changed')
  })

  it('routes all four consumers through Portal references rather than archived links', () => {
    for (const path of [
      'lib/server/iqc.ts', 'lib/server/eqa.ts',
      'lib/server/lotverif.ts', 'lib/server/stock.ts',
    ]) {
      const source = read(path)
      expect(source, path).toContain('bm_portal_equipment_links')
      expect(source, path).toContain('bm_portal_equipment_refs')
    }
    const iqc = read('lib/server/iqc.ts')
    expect(iqc).toContain('instrumentCandidates: allInstruments')
    expect(iqc).toContain("ยังไม่ได้เชื่อมกับ Portal")
    expect(read('components/iqc-settings-center.tsx')).toContain('PortalEquipmentLinker')
    expect(read('components/eqa-view.tsx')).toContain('PortalEquipmentLinker')
    expect(read('components/admin-view.tsx')).toContain('/api/portal-equipment')
  })
})
