import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardSource = readFileSync(join(process.cwd(), 'components/dashboard-view.tsx'), 'utf8')
const storageSource = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

describe('HPV destruction warnings', () => {
  it('shows one-month and two-month warning counts on the dashboard', () => {
    expect(dashboardSource).toContain('hpv.boxesDueSoon')
    expect(dashboardSource).toContain('กล่องเก็บเกิน 1 เดือน')
    expect(dashboardSource).toContain('กล่องเก็บเกิน 2 เดือน')
  })

  it('shows due-soon and due-now labels in Storage boxes', () => {
    expect(storageSource).toContain('getHpvDestructionState(box.destroyDueAt, box.status, today, box.filledAt)')
    expect(storageSource).toContain('label="เกิน 1 เดือน"')
    expect(storageSource).toContain('label="เกิน 2 เดือน"')
    expect(storageSource).toContain("box.status === 'full' && destructionState === 'due_now'")
  })
})
