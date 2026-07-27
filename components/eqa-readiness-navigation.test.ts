import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const view = fs.readFileSync(new URL('./eqa-view.tsx', import.meta.url), 'utf8')
const shared = fs.readFileSync(new URL('./eqa/shared.tsx', import.meta.url), 'utf8')
const roundsTab = fs.readFileSync(new URL('./eqa/rounds-tab.tsx', import.meta.url), 'utf8')

describe('EQA clickable readiness navigation', () => {
  it('routes ApprovalPanel readiness targets through openTarget', () => {
    expect(view).toContain('function openTarget(target: EqaReadinessTarget)')
    expect(shared).toContain('onNavigate(issue.target!)')
  })

  it('gives every round a stable anchor and scrolls to it on focus', () => {
    expect(roundsTab).toContain('`eqa-round-${round.id}`')
    expect(roundsTab).toContain('scrollIntoView({ behavior: \'smooth\', block: \'center\' })')
  })

  it('lets the receipt no longer re-ask for the plan item once the round already has one', () => {
    expect(roundsTab).toContain('ย้ายรายการแผน')
    expect(roundsTab).toContain('showPlanItemSelect')
  })

  it('surfaces how many receipt fields are still missing without blocking the save', () => {
    expect(roundsTab).toContain('ขาดอีก')
    expect(roundsTab).toContain('missingCount')
  })
})
