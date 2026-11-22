import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/print-button'
import { BlandAltmanChart, diffUnit, ScatterChart } from '@/components/instcomp-charts'
import { PAIR_LIMIT_MIN_PERCENT, type ComparePair } from '@/lib/instcomp/compare'
import { formatThaiDate } from '@/lib/bm/thai-date'
import { evaluateStudy, SECTION_LABEL } from '@/lib/methodverif/evaluate'
import type { Verdict } from '@/lib/methodverif/stats'
import type { MethodVerifStatus, MethodVerifStudy } from '@/lib/methodverif/types'
import { PRINT_SHEET_CSS, REPORT_FOOTER, REPORT_SUBHEAD } from '@/lib/reports/print-sheet-css'
import { listAttachments } from '@/lib/server/attachments'
import { requireFullPageActor } from '@/lib/server/auth'
import { HttpError } from '@/lib/server/errors'
import { getMethodVerifStudy, METHODVERIF_ATTACHMENT_ENTITY } from '@/lib/server/methodverif'

export const metadata: Metadata = { title: 'Method verification report' }

const STATUS_LABEL: Record<MethodVerifStatus, string> = {
  draft: 'ร่าง',
  'in-progress': 'กำลังเก็บข้อมูล',
  passed: 'ผ่านเกณฑ์ (รออนุมัติ)',
  failed: 'ไม่ผ่านเกณฑ์',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}
const VERDICT_LABEL: Record<Verdict, string> = { passed: 'ผ่าน', failed: 'ไม่ผ่าน', insufficient: 'ข้อมูลยังไม่พอ' }
const VERDICT_CLASS: Record<Verdict, string> = { passed: 'ok', failed: 'bad', insufficient: '' }
const CATEGORY_LABEL: Record<ComparePair['category'], string> = {
  quantitative: '',
  'both-not-detected': 'ND ทั้งคู่',
  'detected-outside-range': 'นอกช่วงวัด',
  discordant: 'ไม่ตรงกัน',
  incomplete: 'ไม่ครบ',
  invalid: 'อ่านค่าไม่ได้',
}

function fmt(value: number | null | undefined, digits = 3) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}

function PrecisionRaw({ study }: { study: MethodVerifStudy }) {
  const { days, replicates, levels } = study.precision
  if (!levels.length) return null
  return (
    <>
      <h2>ภาคผนวก ก: ผล Precision รายวัน</h2>
      {levels.map((level, index) => (
        <table key={index} className="sheet-grid sheet-fixed" style={{ marginTop: 6 }}>
          <thead>
            <tr><th>{level.label}</th>{Array.from({ length: replicates }, (_, r) => <th key={r} className="num">ซ้ำ {r + 1}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: days }, (_, d) => (
              <tr key={d}><td>วันที่ {d + 1}</td>{Array.from({ length: replicates }, (_, r) => <td key={r} className="num">{level.values[d]?.[r] || '—'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ))}
    </>
  )
}

export default async function MethodVerificationReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireFullPageActor()
  const { id } = await params
  let study: MethodVerifStudy
  try {
    study = await getMethodVerifStudy(id, actor)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound()
    throw error
  }
  const attachments = await listAttachments('methodverif', METHODVERIF_ATTACHMENT_ENTITY, study.id)
  const evaluation = evaluateStudy(study)
  const required = new Set(study.requiredSections)
  const claimUnit = study.scale === 'log10' ? 'SD log10' : 'CV%'
  const devUnit = study.scale === 'log10' ? 'log' : '%'
  const sdUnit = study.scale === 'log10' ? ' (log)' : ''
  const cSummary = evaluation.comparison.summary
  const cUnit = diffUnit(study.scale)
  const comparisonRef = study.comparison.referenceLabel.trim() || 'เครื่องเดิม'
  const chartStudy = { scale: study.scale, pairLimit: study.comparison.pairLimit, referenceLabel: comparisonRef, candidateLabel: study.instrumentLabel }
  const showComparisonAppendix = required.has('comparison') && study.comparison.samples.length > 0

  return (
    <main className="report-page">
      <div className="toolbar print-hidden">
        <Link href="/method-verification">กลับ Method verification</Link>
        <PrintButton />
      </div>

      <section className="sheet">
        <div className="doc-code">สถานะ: {STATUS_LABEL[study.status]}</div>
        <h1>รายงาน Method verification</h1>
        <p className="subhead">{REPORT_SUBHEAD} · ISO 15189:2022 ข้อ 7.3.2 · CLSI EP15-A3 / EP17-A2 / EP06 / EP09</p>

        <table className="info">
          <tbody>
            <tr><th>หัวข้อ</th><td>{study.title}</td></tr>
            <tr><th>การทดสอบ</th><td>{study.testName}{study.unit ? ` (${study.unit})` : ''}</td></tr>
            <tr><th>เครื่อง</th><td>{study.instrumentLabel}</td></tr>
            <tr><th>วันที่เริ่มทวนสอบ</th><td>{formatThaiDate(study.startedOn)}</td></tr>
            <tr><th>สเกลการคำนวณ</th><td>{study.scale === 'log10' ? 'log10 — claim ผู้ผลิตเป็น SD ในหน่วย log10' : 'linear — claim ผู้ผลิตเป็น CV%'}</td></tr>
          </tbody>
        </table>

        <h2>สรุปผลรายหัวข้อ</h2>
        <table className="sheet-grid">
          <thead><tr><th>หัวข้อ</th><th>ผล</th><th>หมายเหตุ</th></tr></thead>
          <tbody>
            {study.requiredSections.map((section) => (
              <tr key={section}>
                <td>{SECTION_LABEL[section]}</td>
                <td className={VERDICT_CLASS[evaluation.sections[section].verdict]}>{VERDICT_LABEL[evaluation.sections[section].verdict]}</td>
                <td>{evaluation.sections[section].reasons.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={`verdict ${evaluation.overall === 'passed' ? 'pass' : evaluation.overall === 'failed' ? 'fail' : ''}`}>
          ผลการทวนสอบรวม: {evaluation.overall === 'passed' ? 'ผ่านเกณฑ์ทุกหัวข้อ' : evaluation.overall === 'failed' ? 'ไม่ผ่านเกณฑ์' : 'ข้อมูลยังไม่ครบสำหรับสรุป'}
        </div>

        {required.has('precision') ? (
          <>
            <h2>1. Precision (CLSI EP15-A3)</h2>
            <p className="muted">{study.precision.days} วัน × {study.precision.replicates} ซ้ำต่อ level · one-way ANOVA · upper verification limit = claim × √(χ²₍₁₋₀.₀₅/ₗ, df₎ / df)</p>
            <table className="sheet-grid">
              <thead>
                <tr>
                  <th>Level</th><th className="num">n</th><th className="num">Mean</th>
                  <th className="num">Sr{sdUnit}</th><th className="num">Claim Sr ({claimUnit})</th><th className="num">UVL Sr</th>
                  <th className="num">S<sub>WL</sub>{sdUnit}</th><th className="num">Claim S<sub>WL</sub> ({claimUnit})</th><th className="num">UVL S<sub>WL</sub></th><th>ผล</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.precision.length ? evaluation.precision.map((level, index) => (
                  <tr key={index}>
                    <td>{level.label}</td>
                    <td className="num">{level.n}</td>
                    <td className="num">{fmt(level.mean)}</td>
                    <td className="num">{fmt(level.repeatability, 4)}{level.repeatabilityCv != null ? ` (${level.repeatabilityCv}%)` : ''}</td>
                    <td className="num">{study.precision.levels[index]?.claimRepeatability ?? '—'}</td>
                    <td className="num">{fmt(level.repeatabilityLimit, 4)}</td>
                    <td className="num">{fmt(level.withinLab, 4)}{level.withinLabCv != null ? ` (${level.withinLabCv}%)` : ''}</td>
                    <td className="num">{study.precision.levels[index]?.claimWithinLab ?? '—'}</td>
                    <td className="num">{fmt(level.withinLabLimit, 4)}</td>
                    <td className={VERDICT_CLASS[level.verdict]}>{VERDICT_LABEL[level.verdict]}</td>
                  </tr>
                )) : <tr><td colSpan={10} className="center muted">ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
          </>
        ) : null}

        {required.has('lod') ? (
          <>
            <h2>2. Limit of detection (CLSI EP17-A2)</h2>
            <table className="sheet-grid">
              <tbody>
                <tr><th>LoD ที่ผู้ผลิตอ้าง</th><td className="num">{study.lod.claimedLod ?? '—'}{study.unit ? ` ${study.unit}` : ''}</td><th>เกณฑ์</th><td>ตรวจพบ ≥ {study.lod.minDetectPercent}% จากอย่างน้อย {study.lod.minReplicates} ซ้ำ</td></tr>
                <tr><th>ตรวจพบ</th><td className="num">{evaluation.lod.detected}/{evaluation.lod.n}{evaluation.lod.detectPercent != null ? ` (${evaluation.lod.detectPercent}%)` : ''}</td><th>ผล</th><td className={VERDICT_CLASS[evaluation.lod.verdict]}>{VERDICT_LABEL[evaluation.lod.verdict]}</td></tr>
              </tbody>
            </table>
            {study.lod.values.some(Boolean) ? <p className="muted">ผลรายซ้ำ: {study.lod.values.filter(Boolean).map((value, index) => `${index + 1}) ${value}`).join(' · ')}</p> : null}
          </>
        ) : null}

        {required.has('linearity') ? (
          <>
            <h2>3. Linearity / Reportable range (CLSI EP06)</h2>
            <table className="sheet-grid">
              <thead><tr><th className="center">#</th><th className="num">ค่าคาดหวัง</th><th>ผลวัด</th><th className="num">Mean{sdUnit}</th><th className="num">เบี่ยงเบน ({devUnit})</th><th>ผล</th></tr></thead>
              <tbody>
                {evaluation.linearity.points.length ? evaluation.linearity.points.map((point, index) => (
                  <tr key={index}>
                    <td className="center">{index + 1}</td>
                    <td className="num">{point.expected ?? '—'}</td>
                    <td>{study.linearity.points[index]?.values.filter(Boolean).join(', ') || '—'}</td>
                    <td className="num">{fmt(point.meanStat)}</td>
                    <td className="num">{point.deviation == null ? '—' : `${point.deviation >= 0 ? '+' : ''}${fmt(point.deviation, study.scale === 'log10' ? 3 : 1)}`}</td>
                    <td className={point.withinLimit === false ? 'bad' : point.withinLimit ? 'ok' : ''}>{point.withinLimit == null ? '—' : point.withinLimit ? 'ในเกณฑ์' : `เกิน ±${study.linearity.limit}`}</td>
                  </tr>
                )) : <tr><td colSpan={6} className="center muted">ยังไม่มีข้อมูล</td></tr>}
              </tbody>
            </table>
            <p className="muted">เกณฑ์: ค่าเบี่ยงเบนแต่ละระดับ ≤ ±{study.linearity.limit} {devUnit} · อย่างน้อย 5 ระดับ{evaluation.linearity.slope != null ? ` · regression: slope ${fmt(evaluation.linearity.slope)}, intercept ${fmt(evaluation.linearity.intercept)}, r ${fmt(evaluation.linearity.r, 4)}` : ''}</p>
          </>
        ) : null}

        {required.has('comparison') ? (
          <>
            <h2>4. Method comparison (CLSI EP09)</h2>
            <p className="muted">เครื่องเดิม: {comparisonRef} → เครื่องใหม่: {study.instrumentLabel} · ผลต่าง = ใหม่ − เดิม ({cUnit}) · เกณฑ์: bias เฉลี่ย ≤ ±{study.comparison.biasLimit} {cUnit}, รายคู่ ≤ ±{study.comparison.pairLimit} {cUnit} อย่างน้อย {PAIR_LIMIT_MIN_PERCENT}% ของคู่, ≥ {study.comparison.minPairs} คู่, detected/ND ต้องตรงกัน</p>
            <table className="sheet-grid">
              <tbody>
                <tr><th>คู่เชิงปริมาณ (n)</th><td className="num">{cSummary.quantitativeN} / {cSummary.totalRows}</td><th>Bias เฉลี่ย ({cUnit})</th><td className="num">{cSummary.meanBias == null ? '—' : `${cSummary.meanBias >= 0 ? '+' : ''}${fmt(cSummary.meanBias)}`}</td></tr>
                <tr><th>SD ของผลต่าง ({cUnit})</th><td className="num">{fmt(cSummary.sdDifference)}</td><th>95% Limits of agreement</th><td className="num">{cSummary.loaLower == null ? '—' : `${fmt(cSummary.loaLower)} ถึง ${fmt(cSummary.loaUpper)}`}</td></tr>
                <tr><th>คู่ในเกณฑ์รายคู่</th><td className="num">{cSummary.withinPairLimitPercent == null ? '—' : `${cSummary.withinPairLimitN}/${cSummary.quantitativeN} (${cSummary.withinPairLimitPercent}%)`}</td><th>Regression (y = a + bx)</th><td className="num">{cSummary.slope == null ? '—' : `b ${fmt(cSummary.slope)} · a ${fmt(cSummary.intercept)} · r ${fmt(cSummary.r)}`}</td></tr>
                <tr><th>Detected / ND concordance</th><td className="num">{cSummary.concordancePercent == null ? '—' : `${cSummary.concordancePercent}%`}</td><th>ผล</th><td className={VERDICT_CLASS[cSummary.verdict]}>{VERDICT_LABEL[cSummary.verdict]}</td></tr>
              </tbody>
            </table>
            {cSummary.quantitativeN >= 2 ? (
              <div className="charts">
                <BlandAltmanChart pairs={evaluation.comparison.pairs} summary={cSummary} study={chartStudy} />
                <ScatterChart pairs={evaluation.comparison.pairs} study={chartStudy} />
              </div>
            ) : null}
          </>
        ) : null}

        <h2>สรุปผล / ความเห็น</h2>
        <div className="conclusion">{study.conclusion ?? ''}</div>

        <div className="signatures">
          <div><div className="line">{study.createdByName ?? ''}</div>ผู้ทำการทวนสอบ</div>
          <div><div className="line">{study.reviewedByName ?? ''}</div>ผู้ทบทวนผล · {study.reviewedAt ? formatThaiDate(study.reviewedAt) : 'วันที่ ........'}</div>
          <div><div className="line">{study.status === 'approved' || study.status === 'rejected' ? study.approvedByName ?? '' : ''}</div>{study.status === 'rejected' ? 'ผู้พิจารณา (ไม่อนุมัติ)' : 'ผู้อนุมัติ'} · {study.approvedAt ? formatThaiDate(study.approvedAt) : 'วันที่ ........'}</div>
        </div>
        <p className="footer-note">{REPORT_FOOTER}</p>
      </section>

      {study.precision.levels.length || attachments.length || showComparisonAppendix ? (
        <section className="sheet sheet-break">
          <PrecisionRaw study={study} />
          {showComparisonAppendix ? (
            <>
              <h2>ภาคผนวก ข: ผล Method comparison รายคู่ ({evaluation.comparison.pairs.length} ราย)</h2>
              <table className="sheet-grid">
                <thead>
                  <tr><th className="center">#</th><th>ตัวอย่าง</th><th className="num">{comparisonRef}</th><th className="num">{study.instrumentLabel}</th><th className="num">ผลต่าง ({cUnit})</th><th>ผล</th></tr>
                </thead>
                <tbody>
                  {evaluation.comparison.pairs.map((pair, index) => {
                    const raw = study.comparison.samples[index]
                    const flagged = pair.category === 'quantitative' ? pair.withinPairLimit === false : pair.category === 'discordant' || pair.category === 'invalid'
                    const label = pair.category === 'quantitative' ? (pair.withinPairLimit ? 'ในเกณฑ์' : `เกิน ±${study.comparison.pairLimit}`) : CATEGORY_LABEL[pair.category]
                    return (
                      <tr key={index}>
                        <td className="center">{index + 1}</td>
                        <td>{raw?.sampleLabel ?? ''}</td>
                        <td className="num">{raw?.referenceRaw || '—'}</td>
                        <td className="num">{raw?.candidateRaw || '—'}</td>
                        <td className="num">{pair.difference == null ? '—' : `${pair.difference >= 0 ? '+' : ''}${fmt(pair.difference, study.scale === 'log10' ? 2 : 1)}`}</td>
                        <td className={flagged ? 'bad' : pair.category === 'quantitative' ? 'ok' : ''}>{label}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          ) : null}
          {attachments.length ? (
            <>
              <h2>ไฟล์แนบในระบบ</h2>
              <ul className="muted">{attachments.map((file) => <li key={file.id}>{file.fileName} · อัปโหลด {formatThaiDate(file.createdAt)}</li>)}</ul>
            </>
          ) : null}
          <p className="footer-note">{REPORT_FOOTER}</p>
        </section>
      ) : null}

      <style>{PRINT_SHEET_CSS}</style>
    </main>
  )
}
