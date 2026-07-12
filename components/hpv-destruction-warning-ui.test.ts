import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardSource = readFileSync(join(process.cwd(), 'components/dashboard-view.tsx'), 'utf8')
const storageSource = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

describe('HPV destruction warnings', () => {
  it('shows a due-soon count on the dashboard', () => {
    expect(dashboardSource).toContain('hpv.boxesDueSoon')
    expect(dashboardSource).toContain('กล่องใกล้ครบกำหนดทำลาย')
  })

  it('shows due-soon and due-now labels in Storage boxes', () => {
    expect(storageSource).toContain('getHpvDestructionState(box.destroyDueAt, box.status, today)')
    expect(storageSource).toContain('เหลือ ${remainingDays} วัน')
    expect(storageSource).toContain('ครบกำหนดทำลาย')
  })
})
