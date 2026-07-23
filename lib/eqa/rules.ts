import type { EqaPlanItem, EqaRound, EqaCorrectiveAction } from '@/lib/eqa/types'

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

export function roundReceiptReadiness(round: Pick<EqaRound,
  | 'planItemId' | 'externalSentDate' | 'sampleReceivedDate' | 'packageCondition'
  | 'receivedTemperature' | 'sampleCondition' | 'storageCondition' | 'specimenType'
  | 'receiverId' | 'analystId' | 'analysisDate' | 'submissionDate' | 'submissionMethod' | 'results'
>) {
  const issues: string[] = []
  if (!round.planItemId) issues.push('ยังไม่ได้จัด round เข้ารายการแผนรายปี')
  if (!round.externalSentDate) issues.push('ยังไม่มีวันที่องค์กรภายนอกส่งตัวอย่าง')
  if (!round.sampleReceivedDate) issues.push('ยังไม่มีวันที่รับตัวอย่าง')
  if (!round.packageCondition) issues.push('ยังไม่ได้บันทึกสภาพห่อตัวอย่าง')
  if (!round.receivedTemperature) issues.push('ยังไม่ได้บันทึกอุณหภูมิขณะรับ')
  if (!round.sampleCondition) issues.push('ยังไม่ได้บันทึกสภาพตัวอย่าง')
  if (!round.storageCondition) issues.push('ยังไม่ได้บันทึกการเก็บตัวอย่าง')
  if (!round.specimenType) issues.push('ยังไม่มีชนิดตัวอย่าง')
  if (!round.receiverId) issues.push('ยังไม่ได้ระบุผู้รับตัวอย่าง')
  if (!round.analystId) issues.push('ยังไม่ได้ระบุผู้ตรวจวิเคราะห์')
  if (!round.analysisDate) issues.push('ยังไม่มีวันที่ตรวจวิเคราะห์')
  if (!round.submissionDate) issues.push('ยังไม่มีวันที่ส่งผล')
  if (!round.submissionMethod) issues.push('ยังไม่มีวิธีส่งผล')
  if (!round.results.length) issues.push('ยังไม่มีรายการตัวอย่าง/ผลที่ส่ง')
  return issues
}

export function annualSummaryReadiness(item: EqaPlanItem, rounds: EqaRound[], correctiveActions: EqaCorrectiveAction[]) {
  const issues: string[] = []
  if (!item.evaluationCriteria) issues.push('ยังไม่มีเกณฑ์การประเมิน')
  if (!item.equipmentName) issues.push('ยังไม่ได้ระบุเครื่องมือ')
  if (item.expectedRounds != null && rounds.length < item.expectedRounds) issues.push(`ผลยังไม่ครบตามแผน (${rounds.length}/${item.expectedRounds} รอบ)`)
  if (!rounds.length) issues.push('ยังไม่มี round ที่ผูกกับรายการแผน')
  for (const round of rounds) {
    if (round.status !== 'evaluated' && round.status !== 'closed') issues.push(`${round.roundLabel}: สถานะ round ยังไม่เป็น evaluated/closed`)
    if (!round.results.length) issues.push(`${round.roundLabel}: ยังไม่มีผลตัวอย่าง`)
    if (round.summaryOutcome === 'not-evaluated') issues.push(`${round.roundLabel}: ยังไม่ได้สรุปผลผ่าน/ไม่ผ่าน`)
    if (round.results.some((result) => result.outcome === 'not-evaluated')) issues.push(`${round.roundLabel}: ยังมีผลที่ไม่ได้ประเมิน`)
    if (round.summaryOutcome === 'fail') {
      const actions = correctiveActions.filter((action) => action.roundId === round.id)
      if (!actions.length) issues.push(`${round.roundLabel}: ผลไม่ผ่านแต่ยังไม่มี corrective action`)
      else if (actions.some((action) => action.status !== 'closed')) issues.push(`${round.roundLabel}: corrective action ยังไม่ปิด`)
    }
  }
  return issues
}
