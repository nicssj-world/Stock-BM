import { LOTVERIF_METHOD_LABEL, LOTVERIF_STATUS_LABEL, lotVerifSubjectLabel, parallelReasonLabel } from '@/lib/lotverif/labels'
import type { LotVerification, LotVerifMeasurement, LotVerifParallelRow } from '@/lib/lotverif/types'
import { requireActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { getLotVerifWorkspace } from '@/lib/server/lotverif'
import { addTableSheet, excelDate, exportOrError, newWorkbook, todayStamp, xlsxResponse } from '@/lib/server/xlsx-export'

/** Every verification with its comparison rows, as a workbook for audits or off-system backup. */
export async function GET() {
  return exportOrError(async () => {
    const actor = await requireActor()
    if (actor.role === 'Assistant') throw new HttpError(403, 'Staff permission required')
    const { verifications } = await getLotVerifWorkspace(actor)
    const byId = new Map(verifications.map((v) => [v.id, v]))
    const title = (id: string) => {
      const v = byId.get(id)
      return v ? v.title || v.newLotLabel || v.id : id
    }
    const book = newWorkbook()

    addTableSheet<LotVerification>(book, 'Verifications', [
      { header: 'หัวข้อ', width: 28, value: (v) => v.title || v.newLotLabel },
      { header: 'ประเภท', value: (v) => lotVerifSubjectLabel(v.subjectKind) },
      { header: 'Lot ใหม่', width: 26, value: (v) => v.newLotLabel },
      { header: 'Lot เดิม', width: 26, value: (v) => v.oldLotLabel },
      { header: 'เครื่องมือ', width: 22, value: (v) => (v.instrumentCode ? `${v.instrumentCode} · ${v.instrumentName ?? ''}` : null) },
      { header: 'วิธี', width: 30, value: (v) => LOTVERIF_METHOD_LABEL[v.method] },
      { header: 'Analyte (parallel)', value: (v) => v.parallelAnalyteCode },
      { header: 'เกณฑ์', width: 28, value: (v) => [v.method === 'parallel-comparison' ? `ABS(Index) ≤ ${v.parallelLimit ?? 1}` : null, v.acceptanceCriteria].filter(Boolean).join(' · ') || null },
      { header: 'ABS(Index)', numFmt: '0.000', value: (v) => v.parallelSummary?.index },
      { header: 'ผลคำนวณ', value: (v) => (v.parallelSummary ? (v.parallelSummary.passed == null ? parallelReasonLabel(v.parallelSummary.reason) : v.parallelSummary.passed ? 'ในเกณฑ์' : 'เกินเกณฑ์') : null) },
      { header: 'สถานะ', value: (v) => LOTVERIF_STATUS_LABEL[v.status] },
      { header: 'สรุปผล', width: 36, value: (v) => v.conclusion },
      { header: 'ผู้ทดสอบ', value: (v) => v.performedByName ?? v.createdByName },
      { header: 'สร้างเมื่อ', numFmt: 'yyyy-mm-dd', value: (v) => excelDate(v.createdAt) },
      { header: 'ผู้สรุปผล', value: (v) => v.reviewedByName },
      { header: 'วันที่สรุปผล', numFmt: 'yyyy-mm-dd', value: (v) => excelDate(v.reviewedAt) },
      { header: 'ผู้อนุมัติ/ปฏิเสธ', value: (v) => v.releasedByName },
      { header: 'วันที่อนุมัติ/ปฏิเสธ', numFmt: 'yyyy-mm-dd', value: (v) => excelDate(v.releasedAt) },
    ], verifications)

    addTableSheet<LotVerifParallelRow>(book, 'Parallel', [
      { header: 'Verification', width: 28, value: (row) => title(row.verificationId) },
      { header: 'Level', width: 7, value: (row) => row.level },
      { header: 'Control', width: 20, value: (row) => row.controlLabel },
      { header: 'ที่มา Mean/SD', value: (row) => row.statsSource },
      { header: 'Mean', numFmt: '0.0000', value: (row) => row.controlMean },
      { header: 'SD', numFmt: '0.0000', value: (row) => row.controlSd },
      { header: 'เดิม 1', value: (row) => row.oldRun1 },
      { header: 'เดิม 2', value: (row) => row.oldRun2 },
      { header: 'ใหม่ 1', value: (row) => row.newRun1 },
      { header: 'ใหม่ 2', value: (row) => row.newRun2 },
      { header: 'Mean เดิม', numFmt: '0.0000', value: (row) => row.currentMean },
      { header: 'Mean ใหม่', numFmt: '0.0000', value: (row) => row.newMean },
      { header: 'ผลต่าง', numFmt: '0.0000', value: (row) => row.difference },
      { header: '%diff', numFmt: '0.00', value: (row) => row.percentDiff },
      { header: 'CV%', numFmt: '0.00', value: (row) => row.cvPercent },
    ], verifications.flatMap((v) => [...v.parallelRows].sort((a, b) => a.level - b.level)))

    addTableSheet<LotVerifMeasurement>(book, 'Measurements', [
      { header: 'Verification', width: 28, value: (m) => title(m.verificationId) },
      { header: 'Analyte', width: 18, value: (m) => m.analyteLabel },
      { header: 'ตัวอย่าง', width: 16, value: (m) => m.sampleLabel },
      { header: 'เดิม', value: (m) => m.oldValue ?? m.oldQualitative },
      { header: 'ใหม่', value: (m) => m.newValue ?? m.newQualitative },
      { header: 'ผลต่าง', numFmt: '0.0000', value: (m) => m.difference },
      { header: '%diff', numFmt: '0.00', value: (m) => m.percentDiff },
      { header: 'ผล', value: (m) => {
        const ok = m.oldQualitative != null || m.newQualitative != null ? m.concordant : m.withinCriteria
        return ok == null ? null : ok ? 'ผ่าน' : 'เกิน'
      } },
      { header: 'หมายเหตุ', width: 24, value: (m) => m.note },
    ], verifications.flatMap((v) => v.measurements))

    return xlsxResponse(book, `lot-verification_${todayStamp()}.xlsx`)
  })
}
