import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/hiv-lab-alert-view.tsx'), 'utf8')
const shell = readFileSync(join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')

describe('HIV LAB Alert interface', () => {
  it('keeps the latest minimal patient form and masks the name at the boundary', () => {
    expect(view).toContain('HN')
    expect(view).toContain('LN / HIV DRT Barcode')
    expect(view).toContain('ชื่อ-นามสกุล')
    expect(view).toContain('Rack')
    expect(view).toContain('ศิxxxน์ จำxxxน์')
    expect(view).not.toContain('DOB')
    expect(view).not.toContain('VL (copies/mL)')
    expect(view).not.toContain('Log')
  })

  it('requires a manual LINE action and locks the row after success', () => {
    expect(view).toContain('ยังไม่ส่ง LINE อัตโนมัติ')
    expect(view).toContain('/api/hiv-alert/alerts/${alert.id}/send')
    expect(view).toContain('ส่งสำเร็จ')
    expect(view).toContain('!sent && !sending')
  })

  it('links every new record to HIV DRT and keeps the Alert out of Assistant navigation', () => {
    expect(view).toContain('/hiv-drt?view=storage&sample=')
    expect(shell).toContain("href: '/hiv-alert'")
    expect(shell).toContain('items: [hpvManagementItem, hivLabAlertManagementItem, hivDrtManagementItem]')
    expect(shell).toContain("items: [hpvManagementItem, { href: '/morning-talk'")
    expect(proxy).toContain("'/hiv-alert/:path*'")
  })

  it('shows at most 20 alerts per page with previous and next controls', () => {
    expect(view).toContain('const HIV_LAB_ALERT_PAGE_SIZE = 20')
    expect(view).toContain('usePagination(workspace.alerts.length, HIV_LAB_ALERT_PAGE_SIZE)')
    expect(view).toContain('const pagedAlerts = workspace.alerts.slice(alertPagination.start, alertPagination.end)')
    expect(view).toContain('{pagedAlerts.map(')
    expect(view).toContain('<Pagination {...alertPagination} total={workspace.alerts.length} onChange={alertPagination.setPage} />')
  })

  it('hides full HIV DRT racks from the new-alert dropdown', () => {
    expect(view).toContain('const availableRacks = workspace.racks.filter((rack) => rack.nextAutoPosition !== null)')
    expect(view).toContain('{availableRacks.map((rack) =>')
    expect(view).toContain('!availableRacks.length')
  })

  it('keeps Auto-fill as default and offers an occupied-aware manual position dialog', () => {
    expect(view).toContain('position: number | null')
    expect(view).toContain('เลือกตำแหน่งเอง')
    expect(view).toContain('HIV_DRT_RACK_CAPACITY')
    expect(view).toContain('disabled={occupiedPositions.has(position)}')
    expect(view).toContain('ยืนยันตำแหน่ง')
    expect(view).toContain('ยกเลิก')
    expect(view).toContain('ใช้ Auto-fill')
    expect(view).toContain('position: form.position')
    expect(view).toContain('position: null')
  })
})
