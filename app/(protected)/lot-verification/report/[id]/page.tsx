import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/print-button'
import { formatThaiDate } from '@/lib/bm/thai-date'
import { LOTVERIF_METHOD_LABEL, LOTVERIF_STATUS_LABEL, lotVerifSubjectLabel, parallelReasonLabel } from '@/lib/lotverif/labels'
import type { LotVerification } from '@/lib/lotverif/types'
import { PRINT_SHEET_CSS, REPORT_FOOTER, REPORT_SUBHEAD } from '@/lib/reports/print-sheet-css'
import { listAttachments } from '@/lib/server/attachments'
import { requireFullPageActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { getLotVerification } from '@/lib/server/lotverif'

export const metadata: Metadata = { title: 'Lot verification report' }

function num(value: number | null | undefined, digits = 3) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}

function raw(value: number | null | undefined) {
  return value == null ? '—' : String(value)
}

function ParallelSection({ v }: { v: LotVerification }) {
  const summary = v.parallelSummary
  const scale = v.parallelScale ?? 'linear'
  const unit = v.parallelUnit ?? (scale === 'log10' ? 'copies/mL' : '')
  const rows = [...v.parallelRows].sort((a, b) => a.level - b.level)
  return (
    <>
      <h2>ผล Parallel comparison · {v.parallelAnalyteCode ?? '—'}{v.parallelAnalyteName ? ` (${v.parallelAnalyteName})` : ''}</h2>
      <p className="muted">ผลวัดกรอกเป็น {unit || 'ค่าผลตรวจ'}; {scale === 'log10' ? 'แปลงเป็น log10 ก่อนคำนวณ' : 'คำนวณในสเกล linear'} · Mean/SD ของ Control อยู่ในสเกล {scale}</p>
      <table className="sheet-grid">
        <thead>
          <tr>
            <th className="center">Level</th>
            <th>Control</th>
            <th className="num">Mean</th>
            <th className="num">SD</th>
            <th className="num">Lot เดิม 1</th>
            <th className="num">Lot เดิม 2</th>
            <th className="num">Lot ใหม่ 1</th>
            <th className="num">Lot ใหม่ 2</th>
            <th className="num">Mean เดิม</th>
            <th className="num">Mean ใหม่</th>
            <th className="num">CV%</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.id}>
              <td className="center">{row.level}</td>
              <td>{row.controlLabel ?? '—'}<span className="muted"> · {row.statsSource}</span></td>
              <td className="num">{num(row.controlMean)}</td>
              <td className="num">{num(row.controlSd)}</td>
              <td className="num">{raw(row.oldRun1)}</td>
              <td className="num">{raw(row.oldRun2)}</td>
              <td className="num">{raw(row.newRun1)}</td>
              <td className="num">{raw(row.newRun2)}</td>
              <td className="num">{num(row.currentMean)}</td>
              <td className="num">{num(row.newMean)}</td>
              <td className="num">{row.cvPercent == null ? '—' : row.cvPercent.toFixed(2)}</td>
            </tr>
          )) : <tr><td colSpan={11} className="center muted">ยังไม่มีผลที่บันทึก</td></tr>}
        </tbody>
      </table>
      {summary ? (
        <table className="sheet-grid" style={{ marginTop: 8 }}>
          <tbody>
            <tr><th>Mean Lot เดิม (Xc)</th><td className="num">{num(summary.currentMean)}</td><th>Mean Lot ใหม่ (Xn)</th><td className="num">{num(summary.newMean)}</td></tr>
            <tr><th>Mean รวม (Xb)</th><td className="num">{num(summary.allSampleMean)}</td><th>CV ที่ใช้ (level {summary.selectedLevel ?? '—'})</th><td className="num">{summary.selectedCvPercent == null ? '—' : `${summary.selectedCvPercent.toFixed(2)}%`}</td></tr>
            <tr><th>ABS(Index)</th><td className="num">{num(summary.index)}</td><th>เกณฑ์ ABS(Index) ≤</th><td className="num">{summary.limit}</td></tr>
          </tbody>
        </table>
      ) : null}
      <div className={`verdict ${summary?.passed === true ? 'pass' : summary?.passed === false ? 'fail' : ''}`}>
        {summary?.passed === true ? 'ผลคำนวณ: อยู่ในเกณฑ์' : summary?.passed === false ? 'ผลคำนวณ: เกินเกณฑ์' : `ผลคำนวณ: ${summary ? parallelReasonLabel(summary.reason) : 'ยังไม่มีข้อมูล'}`}
      </div>
    </>
  )
}

function MeasurementSection({ v }: { v: LotVerification }) {
  return (
    <>
      <h2>ผลเปรียบเทียบ ({v.measurements.length} รายการ)</h2>
      <table className="sheet-grid">
        <thead>
          <tr>
            <th>Analyte / ตัวอย่าง</th>
            <th className="num">Lot เดิม</th>
            <th className="num">Lot ใหม่</th>
            <th className="num">ผลต่าง</th>
            <th className="num">%diff</th>
            <th>ผล</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {v.measurements.length ? v.measurements.map((m) => {
            const qualitative = m.oldQualitative != null || m.newQualitative != null
            const ok = qualitative ? m.concordant : m.withinCriteria
            return (
              <tr key={m.id}>
                <td>{[m.analyteLabel, m.sampleLabel].filter(Boolean).join(' · ') || '—'}</td>
                <td className="num">{qualitative ? m.oldQualitative ?? '—' : raw(m.oldValue)}</td>
                <td className="num">{qualitative ? m.newQualitative ?? '—' : raw(m.newValue)}</td>
                <td className="num">{num(m.difference)}</td>
                <td className="num">{m.percentDiff == null ? '—' : `${m.percentDiff.toFixed(1)}%`}</td>
                <td className={ok === false ? 'bad' : ok ? 'ok' : ''}>{ok == null ? '—' : ok ? 'ผ่าน' : 'เกิน'}</td>
                <td>{m.note ?? ''}</td>
              </tr>
            )
          }) : <tr><td colSpan={7} className="center muted">ยังไม่มีข้อมูลเทียบ</td></tr>}
        </tbody>
      </table>
    </>
  )
}

export default async function LotVerificationReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireFullPageActor()
  const { id } = await params
  let v: LotVerification
  try {
    v = await getLotVerification(id, actor)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound()
    throw error
  }
  const attachments = await listAttachments('lotverif', 'verification', v.id)
  const decided = v.status === 'released' || v.status === 'rejected'

  return (
    <main className="report-page">
      <div className="toolbar print-hidden">
        <Link href="/lot-verification">กลับ Lot verification</Link>
        <PrintButton />
      </div>

      <section className="sheet">
        <div className="doc-code">สถานะ: {LOTVERIF_STATUS_LABEL[v.status]}</div>
        <h1>รายงานการตรวจสอบ Lot-to-lot verification</h1>
        <p className="subhead">{REPORT_SUBHEAD} · ISO 15189:2022 ข้อ 6.6.3</p>

        <table className="info">
          <tbody>
            <tr><th>หัวข้อ</th><td>{v.title || v.newLotLabel || '—'}</td></tr>
            <tr><th>ประเภท</th><td>{lotVerifSubjectLabel(v.subjectKind)}</td></tr>
            <tr><th>Lot ใหม่</th><td>{v.newLotLabel ?? '—'}</td></tr>
            <tr><th>Lot เดิม (เทียบ)</th><td>{v.oldLotLabel ?? '—'}</td></tr>
            <tr><th>เครื่องมือ</th><td>{v.instrumentCode ? `${v.instrumentCode} · ${v.instrumentName ?? ''}` : '—'}</td></tr>
            <tr><th>วิธีตรวจตาม SOP</th><td>{LOTVERIF_METHOD_LABEL[v.method]}</td></tr>
            <tr><th>เกณฑ์การยอมรับ</th><td>{v.method === 'parallel-comparison' ? `ABS(Index) ≤ ${v.parallelLimit ?? 1}` : ''}{v.method === 'parallel-comparison' && v.acceptanceCriteria ? ' · ' : ''}{v.acceptanceCriteria ?? (v.method === 'parallel-comparison' ? '' : '—')}</td></tr>
            <tr><th>วันที่สร้างรายการ</th><td>{formatThaiDate(v.createdAt)}</td></tr>
          </tbody>
        </table>

        {v.method === 'parallel-comparison' ? <ParallelSection v={v} /> : <MeasurementSection v={v} />}

        <h2>สรุปผล</h2>
        <div className="conclusion">{v.conclusion ?? ''}</div>

        {attachments.length ? (
          <>
            <h2>ไฟล์แนบในระบบ (รายงาน / CoA)</h2>
            <ul className="muted">
              {attachments.map((file) => <li key={file.id}>{file.fileName} · อัปโหลด {formatThaiDate(file.createdAt)}</li>)}
            </ul>
          </>
        ) : null}

        <div className="signatures">
          <div>
            <div className="line">{v.performedByName ?? v.createdByName ?? ''}</div>
            ผู้ทำการทดสอบ
          </div>
          <div>
            <div className="line">{v.reviewedByName ?? ''}</div>
            ผู้สรุปผล · {v.reviewedAt ? formatThaiDate(v.reviewedAt) : 'วันที่ ........'}
          </div>
          <div>
            <div className="line">{decided ? v.releasedByName ?? '' : ''}</div>
            {v.status === 'rejected' ? 'ผู้พิจารณา (ปฏิเสธ)' : 'ผู้อนุมัติใช้'} · {decided && v.releasedAt ? formatThaiDate(v.releasedAt) : 'วันที่ ........'}
          </div>
        </div>
        <p className="footer-note">{REPORT_FOOTER}</p>
      </section>

      <style>{PRINT_SHEET_CSS}</style>
    </main>
  )
}
