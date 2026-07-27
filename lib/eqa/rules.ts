import type { EqaPlanItem, EqaRound, EqaRoundStatus, EqaCorrectiveAction } from '@/lib/eqa/types'

// The real-world sequence a round's status moves through. Shared between the
// server (which auto-advances a round to the next status as the matching
// action happens -- receipt saved, analyst confirms, summary saved, technical
// manager confirms) and the client (which uses the same order to decide how
// much of the round card to reveal, so an empty round doesn't dump every
// field on the user at once).
export const ROUND_STATUS_ORDER: EqaRoundStatus[] = ['scheduled', 'received', 'submitted', 'evaluated', 'closed']
export function roundStatusIndex(status: EqaRoundStatus) { return ROUND_STATUS_ORDER.indexOf(status) }

export function plannedRoundLabel(sequence: number, planYear: number) {
  return `ครั้งที่ ${sequence}/${planYear + 543}`
}

export function plannedRoundDueDate(planYear: number, plannedMonth: number) {
  return new Date(Date.UTC(planYear, plannedMonth, 0)).toISOString().slice(0, 10)
}

// The plan item already fully specifies its rounds via `occurrences` (one
// per planned month). This turns the occurrences the plan hasn't materialised
// into rounds yet into round-creation input, in order, continuing the
// sequence after whatever rounds already exist for the item. `existingRoundCount`
// is a plain count (not full EqaRound objects) so this is equally usable from
// a client component (`itemRounds.length`) and from a server function that
// only has narrow row selects on hand.
export function missingPlannedRounds(item: Pick<EqaPlanItem, 'occurrences'>, existingRoundCount: number, planYear: number) {
  const sorted = [...item.occurrences].sort((a, b) => a.sortOrder - b.sortOrder || a.plannedMonth - b.plannedMonth)
  return sorted.slice(existingRoundCount).map((occurrence, index) => {
    const sequence = existingRoundCount + index + 1
    return {
      sequence,
      plannedMonth: occurrence.plannedMonth,
      roundLabel: plannedRoundLabel(sequence, planYear),
      resultDueDate: plannedRoundDueDate(planYear, occurrence.plannedMonth),
    }
  })
}

export function annualPlanReadiness(items: EqaPlanItem[]) {
  const issues: string[] = []
  if (!items.length) issues.push('ยังไม่มีรายการ EQA ในแผน')
  for (const item of items) {
    const label = item.sampleSetName || item.projectName
    if (!item.projectName || !item.providerName || !item.sampleSetName || !item.testItem) issues.push(`${label}: ข้อมูลโครงการยังไม่ครบ`)
    if (item.expectedRounds && item.occurrences.length !== item.expectedRounds) issues.push(`${label}: จำนวนเดือนที่วางแผนไม่ตรงกับ ${item.expectedRounds} ครั้ง`)
    if (!item.expectedRounds && !item.note) issues.push(`${label}: ต้องระบุจำนวนครั้งหรือหมายเหตุ`)
    if (item.occurrences.some((itemOccurrence) => !itemOccurrence.responsibleCode)) issues.push(`${label}: รหัสผู้รับผิดชอบยังไม่ครบ`)
  }
  return issues
}

// Structured readiness -- same messages as the plain-string functions below,
// but each issue optionally carries a target the UI can navigate to (switch
// tab, scroll a round into view, open its receipt editor). Kept in this pure
// module (no server-only) so both the server workspace builder and client
// components can compute it without shipping it over the wire.
export type EqaReadinessTarget =
  | { kind: 'receipt-field'; roundId: string; field: string }
  | { kind: 'round-results' | 'round-status' | 'round-summary'; roundId: string }
  | { kind: 'corrective'; roundId: string }
  | { kind: 'plan-item'; planItemId: string }
export interface EqaReadinessIssue { message: string; target?: EqaReadinessTarget }

export function roundReceiptIssues(round: Pick<EqaRound,
  | 'id' | 'planItemId' | 'externalSentDate' | 'sampleReceivedDate' | 'packageCondition'
  | 'receivedTemperature' | 'sampleCondition' | 'storageCondition' | 'specimenType'
  | 'receiverId' | 'analystId' | 'analysisDate' | 'submissionDate' | 'submissionMethod' | 'results'
>): EqaReadinessIssue[] {
  const field = (name: string): EqaReadinessTarget => ({ kind: 'receipt-field', roundId: round.id, field: name })
  const issues: EqaReadinessIssue[] = []
  if (!round.planItemId) issues.push({ message: 'ยังไม่ได้จัด round เข้ารายการแผนรายปี', target: field('planItemId') })
  if (!round.externalSentDate) issues.push({ message: 'ยังไม่มีวันที่องค์กรภายนอกส่งตัวอย่าง', target: field('externalSentDate') })
  if (!round.sampleReceivedDate) issues.push({ message: 'ยังไม่มีวันที่รับตัวอย่าง', target: field('sampleReceivedDate') })
  if (!round.packageCondition) issues.push({ message: 'ยังไม่ได้บันทึกสภาพห่อตัวอย่าง', target: field('packageCondition') })
  if (!round.receivedTemperature) issues.push({ message: 'ยังไม่ได้บันทึกอุณหภูมิขณะรับ', target: field('receivedTemperature') })
  if (!round.sampleCondition) issues.push({ message: 'ยังไม่ได้บันทึกสภาพตัวอย่าง', target: field('sampleCondition') })
  if (!round.storageCondition) issues.push({ message: 'ยังไม่ได้บันทึกการเก็บตัวอย่าง', target: field('storageCondition') })
  if (!round.specimenType) issues.push({ message: 'ยังไม่มีชนิดตัวอย่าง', target: field('specimenType') })
  if (!round.receiverId) issues.push({ message: 'ยังไม่ได้ระบุผู้รับตัวอย่าง', target: field('receiverId') })
  if (!round.analystId) issues.push({ message: 'ยังไม่ได้ระบุผู้ตรวจวิเคราะห์', target: field('analystId') })
  if (!round.analysisDate) issues.push({ message: 'ยังไม่มีวันที่ตรวจวิเคราะห์', target: field('analysisDate') })
  if (!round.submissionDate) issues.push({ message: 'ยังไม่มีวันที่ส่งผล', target: field('submissionDate') })
  if (!round.submissionMethod) issues.push({ message: 'ยังไม่มีวิธีส่งผล', target: field('submissionMethod') })
  if (!round.results.length) issues.push({ message: 'ยังไม่มีรายการตัวอย่าง/ผลที่ส่ง', target: { kind: 'round-results', roundId: round.id } })
  return issues
}
export function roundReceiptReadiness(round: Parameters<typeof roundReceiptIssues>[0]) {
  return roundReceiptIssues(round).map((issue) => issue.message)
}

export function annualSummaryIssues(item: EqaPlanItem, rounds: EqaRound[], correctiveActions: EqaCorrectiveAction[]): EqaReadinessIssue[] {
  const issues: EqaReadinessIssue[] = []
  const planItemTarget: EqaReadinessTarget = { kind: 'plan-item', planItemId: item.id }
  if (!item.evaluationCriteria) issues.push({ message: 'ยังไม่มีเกณฑ์การประเมิน', target: planItemTarget })
  if (!item.equipmentName) issues.push({ message: 'ยังไม่ได้ระบุเครื่องมือ', target: planItemTarget })
  if (item.expectedRounds != null && rounds.length < item.expectedRounds) issues.push({ message: `ผลยังไม่ครบตามแผน (${rounds.length}/${item.expectedRounds} รอบ)`, target: planItemTarget })
  if (!rounds.length) issues.push({ message: 'ยังไม่มี round ที่ผูกกับรายการแผน', target: planItemTarget })
  for (const round of rounds) {
    if (round.status !== 'evaluated' && round.status !== 'closed') issues.push({ message: `${round.roundLabel}: สถานะ round ยังไม่เป็น evaluated/closed`, target: { kind: 'round-status', roundId: round.id } })
    if (!round.results.length) issues.push({ message: `${round.roundLabel}: ยังไม่มีผลตัวอย่าง`, target: { kind: 'round-results', roundId: round.id } })
    if (round.summaryOutcome === 'not-evaluated') issues.push({ message: `${round.roundLabel}: ยังไม่ได้สรุปผลผ่าน/ไม่ผ่าน`, target: { kind: 'round-summary', roundId: round.id } })
    if (round.results.some((result) => result.outcome === 'not-evaluated')) issues.push({ message: `${round.roundLabel}: ยังมีผลที่ไม่ได้ประเมิน`, target: { kind: 'round-results', roundId: round.id } })
    if (round.summaryOutcome === 'fail') {
      const actions = correctiveActions.filter((action) => action.roundId === round.id)
      if (!actions.length) issues.push({ message: `${round.roundLabel}: ผลไม่ผ่านแต่ยังไม่มี corrective action`, target: { kind: 'corrective', roundId: round.id } })
      else if (actions.some((action) => action.status !== 'closed')) issues.push({ message: `${round.roundLabel}: corrective action ยังไม่ปิด`, target: { kind: 'corrective', roundId: round.id } })
    }
  }
  return issues
}
export function annualSummaryReadiness(item: EqaPlanItem, rounds: EqaRound[], correctiveActions: EqaCorrectiveAction[]) {
  return annualSummaryIssues(item, rounds, correctiveActions).map((issue) => issue.message)
}

export interface EqaRoundStep {
  key: 'receipt' | 'results' | 'evaluated' | 'summary' | 'approved'
  label: string
  done: boolean
  target?: EqaReadinessTarget
}

// The real-world sequence a round moves through, for the progress strip on
// each round card. "receipt" excludes the round-results issue from
// roundReceiptIssues() -- otherwise "no results yet" would fail both this
// step and the "results" step below, which would read as the same gap twice.
export function roundProgress(round: EqaRound): EqaRoundStep[] {
  const receiptIssues = roundReceiptIssues(round).filter((issue) => issue.target?.kind !== 'round-results')
  const hasResults = round.results.length > 0
  const evaluated = (round.status === 'evaluated' || round.status === 'closed') && !round.results.some((result) => result.outcome === 'not-evaluated')
  const summarized = round.summaryOutcome !== 'not-evaluated'
  const approved = round.documentState.status === 'approved'
  return [
    { key: 'receipt', label: 'แบบรับตัวอย่างครบ', done: receiptIssues.length === 0, target: receiptIssues[0]?.target },
    { key: 'results', label: 'มีผล', done: hasResults, target: hasResults ? undefined : { kind: 'round-results', roundId: round.id } },
    { key: 'evaluated', label: 'ประเมินแล้ว', done: evaluated, target: evaluated ? undefined : { kind: 'round-status', roundId: round.id } },
    { key: 'summary', label: 'สรุปผ่าน/ไม่ผ่าน', done: summarized, target: summarized ? undefined : { kind: 'round-summary', roundId: round.id } },
    { key: 'approved', label: 'อนุมัติครบ 2 ราย', done: approved },
  ]
}
