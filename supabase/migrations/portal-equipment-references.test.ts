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

  it('uses valid PL/pgSQL quoting and permits new links only to active Portal equipment', () => {
    expect(sql).toMatch(/security invoker set search_path = public as \$portal_equipment_link_rpc\$/i)
    expect(sql).toContain('$portal_equipment_link_rpc$;')
    expect(sql).toContain("status in ('active','inactive','maintenance','out_of_service','decommissioned')")
    expect(sql).toContain("refs.status <> 'active'")
    expect(sql).toContain('delete from public.bm_portal_equipment_links')
    expect(sql).toContain('on conflict (module, entity_id, portal_equipment_id) do nothing')
  })

  it('fails closed when the production IQC baseline signature or expected guard changes', () => {
    expect(sql).toContain("to_regprocedure('public.apply_iqc_vl_baseline(uuid,uuid,uuid,uuid,text,numeric,numeric,text,text,text,jsonb,jsonb,jsonb)')")
    expect(sql).toContain("if v_function is null then")
    expect(sql).toContain("equipment.status = ''active''")
    expect(sql).toContain('raise exception')
  })

  it('uses the same active-only rule in Portal, EQA, Stock, IQC and Lot Verification workflows', () => {
    expect(read('components/portal-equipment-linker.tsx')).toContain('canLinkPortalEquipmentStatus')
    expect(read('components/eqa-view.tsx')).toContain('canLinkPortalEquipmentStatus')
    expect(read('components/admin-view.tsx')).toContain('canLinkPortalEquipmentStatus')
    expect(read('lib/server/iqc.ts')).toContain('canUsePortalEquipmentStatus')
    expect(read('lib/server/lotverif.ts')).toContain('canUsePortalEquipmentStatus')
  })

  it('refreshes linked equipment status from Portal before IQC and Lot Verification operations', () => {
    const references = read('lib/server/portal-equipment-references.ts')
    expect(references).toContain('export async function refreshPortalEquipmentReference')
    expect(references).toContain('fetchPortalEquipmentByLabCode(code)')
    expect(references).toContain('portal.portal_equipment_id !== normalizedId')
    expect(read('lib/server/iqc.ts')).toContain('refreshPortalEquipmentReference')
    expect(read('lib/server/lotverif.ts')).toContain('refreshPortalEquipmentReference')
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
