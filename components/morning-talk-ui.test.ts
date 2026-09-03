import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const view = readFileSync(join(process.cwd(), 'components/morning-talk-view.tsx'), 'utf8')
const shell = readFileSync(join(process.cwd(), 'components/app-shell.tsx'), 'utf8')
const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')

describe('Morning Talk interface', () => {
  it('lets Admin assign attendees and users acknowledge their own attendance', () => {
    expect(view).toContain('ผู้เข้าประชุม')
    expect(view).toContain('รับทราบ')
    expect(view).toContain('/acknowledge')
  })

  it('supports checklist completion and accountable action items', () => {
    expect(view).toContain('Checklist ประจำวัน')
    expect(view).toContain('Action items / งานติดตาม')
    expect(view).toContain('/checklist/')
    expect(view).toContain('/actions/')
    expect(view).toContain('Action ค้างทั้งหมด')
  })

  it('is visible and protected for every active QMS user', () => {
    expect(shell).toContain("href: '/morning-talk'")
    expect(proxy).toContain("'/morning-talk/:path*'")
  })
})
