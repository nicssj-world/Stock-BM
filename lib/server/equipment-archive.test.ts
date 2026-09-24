import { describe, expect, it, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { equipmentArchiveModeEnabled, portalEquipmentUrl, respondEquipmentWrite } from './equipment-archive'

const previousMode = process.env.EQUIPMENT_ARCHIVE_MODE
const previousPortalUrl = process.env.PORTAL_PUBLIC_BASE_URL
afterEach(() => {
  if (previousMode === undefined) delete process.env.EQUIPMENT_ARCHIVE_MODE
  else process.env.EQUIPMENT_ARCHIVE_MODE = previousMode
  if (previousPortalUrl === undefined) delete process.env.PORTAL_PUBLIC_BASE_URL
  else process.env.PORTAL_PUBLIC_BASE_URL = previousPortalUrl
})

describe('equipment archive mode', () => {
  it('stays disabled unless explicitly set to 1', () => {
    delete process.env.EQUIPMENT_ARCHIVE_MODE
    expect(equipmentArchiveModeEnabled()).toBe(false)
    process.env.EQUIPMENT_ARCHIVE_MODE = '0'
    expect(equipmentArchiveModeEnabled()).toBe(false)
  })

  it('blocks writes with 410 and points to Portal without calling the handler', async () => {
    process.env.EQUIPMENT_ARCHIVE_MODE = '1'
    process.env.PORTAL_PUBLIC_BASE_URL = 'https://portal.example.test/'
    let called = false
    const response = await respondEquipmentWrite(async () => { called = true; return { saved: true } })
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({
      error: 'ส่วนเครื่องมือใน Stock-BM อยู่ในโหมดอ่านอย่างเดียว กรุณาดำเนินการต่อใน Portal',
      portalUrl: 'https://portal.example.test/staff/equipment',
    })
    expect(called).toBe(false)
  })

  it('keeps equipment QR targets mapped to the existing Portal equipment URL', () => {
    process.env.PORTAL_PUBLIC_BASE_URL = 'https://portal.example.test'
    expect(portalEquipmentUrl('equipment id')).toBe('https://portal.example.test/e/equipment%20id')
  })

  it('guards every equipment API write handler and equipment attachment mutation', () => {
    const root = join(process.cwd(), 'app/api/equipment')
    const files: string[] = []
    const visit = (directory: string) => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, item.name)
        if (item.isDirectory()) visit(path)
        else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts')) files.push(path)
      }
    }
    visit(root)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const handlers = [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\b([\s\S]*?)(?=export async function|$)/g)]
      for (const handler of handlers) expect(handler[2], relative(process.cwd(), file)).toContain('respondEquipmentWrite(')
    }
    const attachmentRoute = readFileSync(join(process.cwd(), 'app/api/attachments/route.ts'), 'utf8')
    const attachmentDeleteRoute = readFileSync(join(process.cwd(), 'app/api/attachments/[id]/route.ts'), 'utf8')
    expect(attachmentRoute).toContain('if (mod === "equipment") assertEquipmentWriteAllowed()')
    expect(attachmentDeleteRoute).toContain('data?.module === "equipment"')
  })

  it('prepares a disabled database lock for equipment, routine, sync, and attachment tables', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260924100000_equipment_archive_read_only.sql'), 'utf8')
    expect(sql).toContain('values (true, false)')
    expect(sql).toContain("'bm_equipment_routine_maintenance'")
    expect(sql).toContain("'bm_equipment_service_records'")
    expect(sql).toContain("'bm_equipment_sync_issues'")
    expect(sql).toContain('on public.bm_attachments')
    expect(sql).toContain("v_module is distinct from 'equipment'")
    expect(sql).toContain("errcode = '55000'")
  })

  it('lets legacy routine QR requests reach the Portal redirect before Stock-BM login', () => {
    const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
    const routinePage = readFileSync(join(process.cwd(), 'app/(protected)/equipment/routine/[token]/page.tsx'), 'utf8')
    expect(proxy).toContain("process.env.EQUIPMENT_ARCHIVE_MODE === '1'")
    expect(proxy).toContain('/equipment\\/routine\\/')
    expect(routinePage).toContain('if (equipmentArchiveModeEnabled())')
    expect(routinePage).toContain('redirect(portalUrl)')
  })
})
