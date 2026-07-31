import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const view = fs.readFileSync(new URL('./eqa-view.tsx', import.meta.url), 'utf8')
const shared = fs.readFileSync(new URL('./eqa/shared.tsx', import.meta.url), 'utf8')
const roundsTab = fs.readFileSync(new URL('./eqa/rounds-tab.tsx', import.meta.url), 'utf8')
const server = fs.readFileSync(new URL('../lib/server/eqa.ts', import.meta.url), 'utf8')

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

  it('shows which assigned user must approve each pending signature', () => {
    expect(shared).toContain('ยังไม่ได้กำหนดผู้อนุมัติ')
    expect(shared).toContain('รอ ${')
  })

  it('requires only the technical manager for an online annual-plan approval', () => {
    expect(server).toContain("'annual-plan': ['technical-manager']")
    expect(shared).toContain("type === 'annual-plan' ? ['technical-manager']")
  })

  it('approves an annual summary once the technical manager and section head have confirmed', () => {
    expect(server).toContain("'annual-summary': ['technical-manager', 'section-head']")
    expect(server).toContain('Reconcile approvals already recorded under an earlier workflow change')
    expect(shared).toContain("type === 'annual-summary' ? ['technical-manager', 'section-head']")
  })

  it('hides the add-result form after submission and edits a result in its own row', () => {
    expect(roundsTab).toContain("const canAddResults = statusIndex <= roundStatusIndex('submitted')")
    expect(roundsTab).toContain('{!editingResult && canAddResults ? <form')
    expect(roundsTab).toContain("const isEditing = editingResult?.id === result.id")
    expect(roundsTab).toContain('onClick={() => saveResult()}')
  })

  it('allows an EQA result to be explicitly linked to the IQC analyte used for Six Sigma bias', () => {
    expect(roundsTab).toContain('เชื่อมกับ IQC panel (ใช้คำนวณ Bias / Six Sigma)')
  })

  it('preserves the analyst confirmation when provider evaluation is recorded after submission', () => {
    expect(server).toContain('async function invalidateResultDocuments(roundId: string)')
    expect(server).toContain("ROUND_STATUS_ORDER.indexOf(status) < ROUND_STATUS_ORDER.indexOf('submitted')")
    expect(server).toContain('await invalidateResultDocuments(roundId)')
    expect(roundsTab).toContain("const analystConfirmed = round.approvals.some((approval) => approval.approvalRole === 'analyst')")
    expect(roundsTab).toContain("lockedRoles={analystConfirmed ? ['analyst'] : undefined}")
    expect(shared).toContain('!lockedRoles?.includes(role)')
  })

  it('lets an Admin complete a configured approver step when no separate portal user exists', () => {
    expect(shared).toContain("return actor.role === 'Admin' || data.approverAssignments")
    expect(server).toContain("if (actor.role !== 'Admin' && (!assignment || assignment.userId !== actor.id))")
  })

  it('lets an Admin confirm the analyst step when the analyst has no portal account', () => {
    expect(shared).toContain("if (role === 'analyst') return actor.role === 'Admin' || analystId === actor.id")
    expect(server).toContain("actor.role !== 'Admin' && round.analystId !== actor.id")
  })
})
