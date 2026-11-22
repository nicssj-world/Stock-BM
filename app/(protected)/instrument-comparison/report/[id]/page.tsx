import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/print-button'
import { BlandAltmanChart, diffUnit, fmt, ScatterChart } from '@/components/instcomp-charts'
import { formatThaiDate } from '@/lib/bm/thai-date'
import { compareInstruments, PAIR_LIMIT_MIN_PERCENT, type ComparePair, type ParsedResult } from '@/lib/instcomp/compare'
import type { InstCompStatus } from '@/lib/instcomp/types'
import { PRINT_SHEET_CSS, REPORT_FOOTER, REPORT_SUBHEAD } from '@/lib/reports/print-sheet-css'
import { listAttachments } from '@/lib/server/attachments'
import { requireFullPageActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { getInstCompStudy, INSTCOMP_ATTACHMENT_ENTITY } from '@/lib/server/instcomp'

export const metadata: Metadata = { title: 'Instrument comparison report' }

const STATUS_LABEL: Record<InstCompStatus, string> = {
  draft: 'ร่าง',
  'in-progress': 'กำลังเก็บข้อมูล',
  passed: 'ผ่านเกณฑ์ (รออนุมัติ)',
  failed: 'ไม่ผ่านเกณฑ์',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}

const CATEGORY_LABEL: Record<ComparePair['category'], string> = {
  quantitative: '',
  'both-not-detected': 'ND ทั้งคู่',
  'detected-outside-range': 'นอกช่วงวัด',
  discordant: 'ไม่ตรงกัน',
  incomplete: 'ไม่ครบ',
  invalid: 'อ่านค่าไม่ได้',
}

function rawText(parsed: ParsedResult, raw: string | null) {
  return parsed.kind === 'empty' ? '—' : raw ?? '—'
}

export default async function InstrumentComparisonReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireFullPageActor()
  const { id } = await params
  let study
  try {
    study = await getInstCompStudy(id, actor)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound()
    throw error
  }
  const attachments = await listAttachments('instcomp', INSTCOMP_ATTACHMENT_ENTITY, study.id)
  const { pairs, summary } = compareInstruments(
    study.samples.map((sample) => ({ rowNo: sample.rowNo, sampleLabel: sample.sampleLabel, referenceRaw: sample.referenceRaw, candidateRaw: sample.candidateRaw })),
    { scale: study.scale, biasLimit: study.biasLimit, pairLimit: study.pairLimit, minPairs: study.minPairs },
  )
  const unit = diffUnit(study.scale)
  const rawBySample = new Map(study.samples.map((sample) => [sample.rowNo, sample]))
  const verdictClass = summary.verdict === 'passed' ? 'pass' : summary.verdict === 'failed' ? 'fail' : ''
  const verdictLabel = summary.verdict === 'passed' ? 'ผลการประเมิน: ผ่านเกณฑ์ทุกข้อ' : summary.verdict === 'failed' ? 'ผลการประเมิน: ไม่ผ่านเกณฑ์' : 'ผลการประเมิน: ข้อมูลยังไม่พอสำหรับสรุป'
  const signed = (value: number | null) => (value == null ? '—' : `${value >= 0 ? '+' : ''}${fmt(value)}`)

  return (
    <main className="report-page">
      <div className="toolbar print-hidden">
        <Link href="/instrument-comparison">กลับ เปรียบเทียบเครื่อง</Link>
        <PrintButton />
      </div>

      <section className="sheet">
        <div className="doc-code">สถานะ: {STATUS_LABEL[study.status]}</div>
        <h1>รายงานการเปรียบเทียบผลระหว่างเครื่องตรวจวิเคราะห์</h1>
        <p className="subhead">{REPORT_SUBHEAD} · ISO 15189:2022 ข้อ 7.3.2 / 7.3.7.4 · CLSI EP09</p>

        <table className="info">
          <tbody>
            <tr><th>หัวข้อ</th><td>{study.title}</td></tr>
            <tr><th>การทดสอบ</th><td>{study.testName}{study.unit ? ` (${study.unit})` : ''}</td></tr>
            <tr><th>เครื่องอ้างอิง (เดิม)</th><td>{study.referenceLabel}</td></tr>
            <tr><th>เครื่องที่ประเมิน (ใหม่)</th><td>{study.candidateLabel}</td></tr>
            <tr><th>วันที่ทำการทดสอบ</th><td>{formatThaiDate(study.performedOn)}</td></tr>
            <tr><th>สเกลการคำนวณ</th><td>{study.scale === 'log10' ? 'log10 (ผลต่าง = log ใหม่ − log เดิม)' : 'linear (ผลต่างเป็น % ของค่าเครื่องเดิม)'}</td></tr>
            <tr>
              <th>เกณฑ์การยอมรับ</th>
              <td>
                Bias เฉลี่ย ≤ ±{study.biasLimit} {unit} · ผลต่างรายคู่ ≤ ±{study.pairLimit} {unit} อย่างน้อย {PAIR_LIMIT_MIN_PERCENT}% ของคู่ ·
                {' '}จำนวนคู่เชิงปริมาณ ≥ {study.minPairs} · ผล detected / not detected ต้องตรงกันทุกราย
              </td>
            </tr>
          </tbody>
        </table>

        <h2>สรุปสถิติ</h2>
        <table className="sheet-grid">
          <tbody>
            <tr><th>จำนวนตัวอย่างทั้งหมด</th><td className="num">{summary.totalRows}</td><th>คู่เชิงปริมาณ (n)</th><td className="num">{summary.quantitativeN}</td></tr>
            <tr><th>Bias เฉลี่ย ({unit})</th><td className="num">{signed(summary.meanBias)}</td><th>SD ของผลต่าง ({unit})</th><td className="num">{fmt(summary.sdDifference)}</td></tr>
            <tr><th>95% Limits of agreement</th><td className="num">{summary.loaLower == null ? '—' : `${fmt(summary.loaLower)} ถึง ${fmt(summary.loaUpper)}`}</td><th>ผลต่างสูงสุด ({unit})</th><td className="num">{fmt(summary.maxAbsDifference)}</td></tr>
            <tr><th>คู่ในเกณฑ์รายคู่</th><td className="num">{summary.withinPairLimitPercent == null ? '—' : `${summary.withinPairLimitN}/${summary.quantitativeN} (${summary.withinPairLimitPercent}%)`}</td><th>Regression (y = a + bx)</th><td className="num">{summary.slope == null ? '—' : `b ${fmt(summary.slope)} · a ${fmt(summary.intercept)} · r ${fmt(summary.r)}`}</td></tr>
            <tr><th>Detected / ND concordance</th><td className="num">{summary.concordancePercent == null ? '—' : `${summary.concordancePercent}%`}</td><th>ไม่ตรงกัน / อ่านค่าไม่ได้ / ไม่ครบ</th><td className="num">{summary.discordantN} / {summary.invalidN} / {summary.incompleteN}</td></tr>
          </tbody>
        </table>

        <div className={`verdict ${verdictClass}`}>
          {verdictLabel}
          {summary.reasons.length ? <ul>{summary.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
        </div>

        {summary.quantitativeN >= 2 ? (
          <div className="charts">
            <BlandAltmanChart pairs={pairs} summary={summary} study={study} />
            <ScatterChart pairs={pairs} study={study} />
          </div>
        ) : null}

        <h2>สรุปผล / ความเห็นของผู้ทดสอบ</h2>
        <div className="conclusion">{study.conclusion ?? ''}</div>

        <div className="signatures">
          <div>
            <div className="line">{study.createdByName ?? ''}</div>
            ผู้ทำการทดสอบ
          </div>
          <div>
            <div className="line">{study.reviewedByName ?? ''}</div>
            ผู้ทบทวนผล · {study.reviewedAt ? formatThaiDate(study.reviewedAt) : 'วันที่ ........'}
          </div>
          <div>
            <div className="line">{study.status === 'approved' || study.status === 'rejected' ? study.approvedByName ?? '' : ''}</div>
            {study.status === 'rejected' ? 'ผู้พิจารณา (ไม่อนุมัติ)' : 'ผู้อนุมัติ'} · {study.approvedAt ? formatThaiDate(study.approvedAt) : 'วันที่ ........'}
          </div>
        </div>
        <p className="footer-note">{REPORT_FOOTER}</p>
      </section>

      <section className="sheet sheet-break">
        <h2 style={{ marginTop: 0 }}>ภาคผนวก: ผลตัวอย่างรายคู่ ({pairs.length} ราย)</h2>
        <table className="sheet-grid">
          <thead>
            <tr>
              <th className="center">#</th>
              <th>ตัวอย่าง</th>
              <th>{study.referenceLabel}</th>
              <th>{study.candidateLabel}</th>
              <th className="num">ผลต่าง ({unit})</th>
              <th>ผล</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair) => {
              const raw = rawBySample.get(pair.rowNo)
              const flagged = pair.category === 'quantitative' ? pair.withinPairLimit === false : pair.category === 'discordant' || pair.category === 'invalid'
              const label = pair.category === 'quantitative' ? (pair.withinPairLimit ? 'ในเกณฑ์' : `เกิน ±${study.pairLimit}`) : CATEGORY_LABEL[pair.category]
              return (
                <tr key={pair.rowNo}>
                  <td className="center">{pair.rowNo}</td>
                  <td>{pair.sampleLabel ?? ''}</td>
                  <td className="num">{rawText(pair.reference, raw?.referenceRaw ?? null)}</td>
                  <td className="num">{rawText(pair.candidate, raw?.candidateRaw ?? null)}</td>
                  <td className="num">{pair.difference == null ? '—' : `${pair.difference >= 0 ? '+' : ''}${fmt(pair.difference, study.scale === 'log10' ? 2 : 1)}`}</td>
                  <td className={flagged ? 'bad' : pair.category === 'quantitative' ? 'ok' : ''}>{label}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {attachments.length ? (
          <>
            <h2>ไฟล์แนบในระบบ</h2>
            <ul className="muted">
              {attachments.map((file) => <li key={file.id}>{file.fileName} · อัปโหลด {formatThaiDate(file.createdAt)}</li>)}
            </ul>
          </>
        ) : null}
        <p className="footer-note">{REPORT_FOOTER}</p>
      </section>

      <style>{PRINT_SHEET_CSS}</style>
    </main>
  )
}
