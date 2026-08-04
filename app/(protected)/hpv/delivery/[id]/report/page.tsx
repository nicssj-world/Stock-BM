import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePageActor } from '@/lib/server/auth'
import { getHpvDelivery } from '@/lib/server/hpv'
import { formatHpvBoxPosition, hpvCheckoutPurpose, specimenTypeLabel } from '@/lib/hpv/rules'
import { PrintButton } from '@/components/print-button'

function formatThai(value: string) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

function SectionHeading({ children }: { children: string }) {
  return <p className="section"><span className="section-label">{children}</span><span className="section-rule" /></p>
}

// Inline SVG rather than a "✓" glyph: the self-hosted Thai/mono fonts do not
// ship that codepoint, so a character tick would fall back unpredictably.
function Tick() {
  return (
    <svg viewBox="0 0 16 16" className="tick" aria-hidden="true">
      <path d="M3 8.5 6.4 12 13 4.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default async function HpvDeliveryReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor()
  const detail = await getHpvDelivery((await params).id)
  if (!detail) notFound()
  const { delivery, samples } = detail

  return (
    <main className="report-page">
      <div className="toolbar print-hidden">
        <Link href="/hpv" className="back-link">กลับ HPV Genotype</Link>
        <PrintButton />
      </div>

      <section className="sheet">
        <header className="band">
          <div className="org">
            <p className="org-1">โรงพยาบาลชลบุรี</p>
            <p className="org-2">กลุ่มงานเทคนิคการแพทย์</p>
            <p className="org-3">งานอณูชีววิทยา</p>
          </div>
          <div className="doc-no">
            <p className="doc-no-label">เลขที่เอกสาร</p>
            <p className="doc-no-value">{delivery.deliveryCode}</p>
          </div>
        </header>
        <h1>ใบส่งมอบตัวอย่าง HPV</h1>

        <SectionHeading>ข้อมูลการส่งมอบ</SectionHeading>
        <div className="meta-box">
          <div className="meta-cell">
            <p className="meta-label">วันที่ / เวลาส่งมอบ</p>
            <p className="meta-value">{formatThai(delivery.deliveredAt)}</p>
          </div>
          <div className="meta-cell">
            <p className="meta-label">จุดประสงค์</p>
            <p className="meta-value">{delivery.destination ?? '-'}</p>
          </div>
          <div className="meta-cell">
            <p className="meta-label">จำนวนตัวอย่าง</p>
            <p className="meta-count">{samples.length}</p>
          </div>
          <div className="meta-cell">
            <p className="meta-label">ผู้บันทึก</p>
            <p className="meta-value">{delivery.createdByName ?? '-'}</p>
          </div>
          {delivery.note ? (
            <div className="meta-note">
              <p className="meta-label">หมายเหตุ</p>
              <p className="meta-value-normal">{delivery.note}</p>
            </div>
          ) : null}
        </div>

        <SectionHeading>รายการตัวอย่าง</SectionHeading>
        <table className="sample-table">
          <thead>
            <tr>
              <th className="col-index" rowSpan={2}>ลำดับ</th>
              <th className="col-barcode" rowSpan={2}>Barcode</th>
              <th rowSpan={2}>ประเภทตัวอย่าง</th>
              <th rowSpan={2}>กล่อง · ตำแหน่ง</th>
              <th colSpan={3} className="col-purpose-group">จุดประสงค์</th>
              <th rowSpan={2}>Checkout เมื่อ</th>
              <th rowSpan={2}>ผู้ Checkout</th>
            </tr>
            <tr>
              <th className="col-tick">Co-testing</th>
              <th className="col-tick">HPV-OHR</th>
              <th className="col-other">อื่นๆ</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((sample, index) => {
              const purpose = hpvCheckoutPurpose(sample.checkoutDestination)
              return (
                <tr key={sample.id}>
                  <td className="col-index">{index + 1}</td>
                  <td className="col-barcode">{sample.barcode}</td>
                  <td>{specimenTypeLabel(sample.specimenType)}</td>
                  <td>
                    {sample.boxCode
                      ? `${sample.boxCode} · ${formatHpvBoxPosition(sample.position)}`
                      : <>— <span className="tag">นอก Storage box</span></>}
                  </td>
                  <td className="col-tick">{purpose.coTesting ? <Tick /> : null}</td>
                  <td className="col-tick">{purpose.hpvOhr ? <Tick /> : null}</td>
                  <td className="col-other">{purpose.other ?? ''}</td>
                  <td>{sample.checkedOutAt ? formatThai(sample.checkedOutAt) : '-'}</td>
                  <td>{sample.checkedOutByName ?? '-'}</td>
                </tr>
              )
            })}
            {!samples.length ? <tr><td colSpan={9} className="empty">ไม่มีรายการตัวอย่างในรอบส่งมอบนี้</td></tr> : null}
          </tbody>
          {samples.length ? (
            <tfoot>
              <tr><td colSpan={9}>รวมทั้งสิ้น {samples.length} ตัวอย่าง</td></tr>
            </tfoot>
          ) : null}
        </table>

        <SectionHeading>การลงนาม</SectionHeading>
        <div className="sign-box">
          <div className="sign-cell">
            <p className="meta-label">ผู้ส่งมอบ</p>
            <div className="sign-area" />
            <p className="sign-name">{delivery.createdByName ?? '(ลงชื่อ)'}</p>
            <p className="sign-sub">วันที่ ............... / ............... / ...............</p>
          </div>
          <div className="sign-cell">
            <p className="meta-label">ผู้รับตัวอย่าง</p>
            <div className="sign-area">
              {delivery.signatureAttachmentId ? (
                // Plain <img>: /api/attachments/[id] 302s to a signed URL, and a
                // lazy or optimised image may not be painted when print fires.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/attachments/${delivery.signatureAttachmentId}`} alt="ลายเซ็นผู้รับตัวอย่าง" className="signature" />
              ) : (
                <span className="sign-missing">ไม่มีไฟล์ลายเซ็น</span>
              )}
            </div>
            <p className="sign-name">{delivery.receiverName ?? 'ลงนามอิเล็กทรอนิกส์'}</p>
            <p className="sign-sub">{formatThai(delivery.deliveredAt)}</p>
            <p className="sign-verify">ลงนามอิเล็กทรอนิกส์ · {delivery.deliveryCode} · {delivery.deliveredAt}</p>
          </div>
        </div>

        <p className="footer-note">
          พิมพ์เมื่อ {formatThai(new Date().toISOString())} · โดย {actor.displayName}
          <br />
          เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต
        </p>
      </section>

      <style>{`
        @page { size: A4 portrait; margin: 14mm 14mm 16mm; }
        body { background: #e9eef0; }
        .report-page { color: #173d50; font-family: "Noto Sans Thai", Arial, sans-serif; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin: 0 auto 12px; max-width: 794px; }
        .back-link, #print-report { border: 1px solid #b8c8cc; background: white; border-radius: 6px; padding: 8px 12px; color: #173d50; font-weight: 700; font-size: 13px; }
        .sheet {
          position: relative; width: 794px; min-height: 1123px; margin: 0 auto; background: white;
          padding: 26px 30px 40px; box-shadow: 0 10px 40px rgba(20, 64, 72, 0.16);
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }

        .band { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid #173d50; }
        .org p { margin: 0; }
        .org-1 { font-size: 12px; font-weight: 700; }
        .org-2 { font-size: 11px; color: #45636b; }
        .org-3 { font-size: 9px; letter-spacing: .1em; color: #7d949a; }
        .doc-no { text-align: right; }
        .doc-no-label { margin: 0 0 3px; font-size: 8px; font-weight: 600; letter-spacing: .16em; color: #7d949a; }
        .doc-no-value { margin: 0; display: inline-block; border: 1.5px solid #173d50; border-radius: 4px; padding: 3px 10px; font-family: "IBM Plex Mono", monospace; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
        h1 { margin: 12px 0 18px; text-align: center; font-size: 20px; font-weight: 700; letter-spacing: .01em; }

        .section { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
        .section-label { font-size: 9px; font-weight: 700; letter-spacing: .18em; color: #0b7f76; white-space: nowrap; }
        .section-rule { flex: 1; height: 1px; background: #cfdde0; }

        .meta-box { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #d8e4e5; background: #f7fafa; border-radius: 6px; margin-bottom: 16px; }
        .meta-cell { padding: 9px 12px; border-left: 1px solid #e4edee; }
        .meta-cell:first-child { border-left: none; }
        .meta-note { grid-column: 1 / -1; padding: 9px 12px; border-top: 1px solid #e4edee; }
        .meta-label { margin: 0 0 3px; font-size: 9px; font-weight: 600; letter-spacing: .1em; color: #7d949a; }
        .meta-value { margin: 0; font-size: 12px; font-weight: 700; }
        .meta-value-normal { margin: 0; font-size: 11px; line-height: 1.5; }
        .meta-count { margin: -2px 0 0; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }

        .sample-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        .sample-table th { background: #eef4f4; border-top: 1.5px solid #b8c8cc; border-bottom: 1.5px solid #b8c8cc; padding: 6px 8px; text-align: left; font-size: 9px; font-weight: 700; letter-spacing: .06em; color: #45636b; }
        .sample-table td { border-bottom: 1px solid #dde7e8; padding: 5px 8px; font-size: 11px; vertical-align: top; }
        .sample-table tbody tr:nth-child(even) { background: #fafcfc; }
        .col-index { width: 30px; text-align: right; font-variant-numeric: tabular-nums; color: #7d949a; }
        .sample-table th.col-index { text-align: right; }
        .col-barcode { font-family: "IBM Plex Mono", monospace; font-weight: 600; font-variant-numeric: tabular-nums; }
        .sample-table th.col-purpose-group { text-align: center; border-bottom: 1px solid #cfdde0; letter-spacing: .14em; color: #0b7f76; }
        .col-tick { width: 56px; text-align: center; }
        .sample-table th.col-tick { text-align: center; border-top: none; font-size: 8px; letter-spacing: .02em; }
        .col-other { width: 62px; }
        .sample-table th.col-other { border-top: none; font-size: 8px; }
        .sample-table td.col-tick { padding-top: 4px; padding-bottom: 4px; }
        .tick { display: inline-block; width: 12px; height: 12px; color: #0b7f76; vertical-align: -1px; }
        .tag { display: inline-block; border: 1px solid #d8e4e5; border-radius: 3px; padding: 0 4px; font-size: 8px; color: #7d949a; }
        .empty { text-align: center; color: #91a4a9; padding: 22px; }
        .sample-table tfoot td { border-top: 1.5px solid #173d50; border-bottom: none; padding-top: 7px; text-align: right; font-size: 12px; font-weight: 700; }

        .sign-box { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #d8e4e5; border-radius: 6px; break-inside: avoid; }
        .sign-cell { padding: 10px 14px 12px; border-left: 1px solid #e4edee; }
        .sign-cell:first-child { border-left: none; }
        .sign-area { display: flex; align-items: flex-end; justify-content: center; height: 64px; border-bottom: 1px solid #97afb4; }
        .signature { max-height: 64px; max-width: 100%; object-fit: contain; }
        .sign-missing { padding-bottom: 6px; font-size: 9px; color: #a8bcc0; }
        .sign-name { margin: 6px 0 0; text-align: center; font-size: 11px; font-weight: 700; }
        .sign-sub { margin: 2px 0 0; text-align: center; font-size: 9px; color: #7d949a; }
        .sign-verify { margin: 5px 0 0; text-align: center; font-family: "IBM Plex Mono", monospace; font-size: 8px; color: #a0b3b7; word-break: break-all; }

        .footer-note { position: absolute; bottom: 14px; left: 30px; right: 30px; margin: 0; text-align: center; font-size: 9px; line-height: 1.6; color: #7d949a; }

        @media print {
          body { background: white; }
          .print-hidden { display: none !important; }
          .sheet { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
          .sample-table thead { display: table-header-group; }
          .sample-table tfoot { display: table-footer-group; }
          .sample-table tr { break-inside: avoid; }
          .footer-note { position: fixed; bottom: 0; left: 0; right: 0; }
        }
      `}</style>
    </main>
  )
}
