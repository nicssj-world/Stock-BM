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
    expect(shell).toContain('items: [hpvManagementItem, hivDrtManagementItem, hivLabAlertManagementItem]')
    expect(shell).toContain("items: [hpvManagementItem, { href: '/morning-talk'")
    expect(proxy).toContain("'/hiv-alert/:path*'")
  })
})
