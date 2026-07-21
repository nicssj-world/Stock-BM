import Link from 'next/link'
import { requirePageActor } from '@/lib/server/auth'
import { getHpvWorkspace } from '@/lib/server/hpv'

function formatNow() {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date())
}

export default async function HpvSummaryReportPage() {
  const actor = await requirePageActor()
  const data = await getHpvWorkspace(actor)

  const rows = data.sites.map((site) => ({
    site,
    summary: data.summaries.find((item) => item.siteId === site.id) ?? { siteId: site.id, issued: 0, received: 0, receivedSelfSupplied: 0, returned: 0, outstanding: 0 },
  }))
  const totals = rows.reduce((acc, row) => ({
    issued: acc.issued + row.summary.issued,
    received: acc.received + row.summary.received,
    receivedSelfSupplied: acc.receivedSelfSupplied + row.summary.receivedSelfSupplied,
    returned: acc.returned + row.summary.returned,
    outstanding: acc.outstanding + row.summary.outstanding,
  }), { issued: 0, received: 0, receivedSelfSupplied: 0, returned: 0, outstanding: 0 })

  return (
    <main className="report-page">
      <div className="toolbar print-hidden">
        <Link href="/hpv" className="back-link">กลับ HPV Management</Link>
        <button id="print-report" type="button">Print / Save PDF</button>
      </div>

      <section className="sheet">
        <h1>สรุปรายงานเบิก-จ่าย-รับคืนชุดตรวจ HPV</h1>
        <p className="subhead">งานอณูชีววิทยา กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี</p>
        <p className="meta">พิมพ์เมื่อ: {formatNow()} · โดย: {actor.displayName}</p>

        <p className="remark">
          หมายเหตุ: ตัวอย่างที่บันทึกว่า &quot;ใช้ชุดตรวจของตัวเอง&quot; ใน Receive Log จะไม่ถูกหักออกจากยอดเบิก
          เนื่องจากหน่วยงานไม่ได้เบิกชุดตรวจจากคลังกลาง ดังนั้นยอด &quot;ส่งกลับ (รวม)&quot; และยอด &quot;คงค้าง&quot;
          จึงไม่จำเป็นต้องบวกลบกันตรงเป๊ะ — ให้ดูคอลัมน์ &quot;ใช้ชุดตรวจของตัวเอง&quot; และ &quot;หมายเหตุ&quot; ประกอบ
        </p>

        <table className="summary-table">
          <thead>
            <tr>
              <th className="col-site">หน่วยงาน</th>
              <th>เบิก</th>
              <th>ส่งกลับ (รวม)</th>
              <th>ใช้ชุดตรวจของตัวเอง</th>
              <th>คืนชุดตรวจ</th>
              <th>คงค้าง</th>
              <th className="col-remark">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ site, summary }) => (
              <tr key={site.id}>
                <td className="col-site">
                  <div className="site-name">{site.name}</div>
                  <div className="site-meta">{site.code ?? '-'} · {site.siteType}</div>
                </td>
                <td>{summary.issued}</td>
                <td>{summary.received}</td>
                <td>{summary.receivedSelfSupplied || '-'}</td>
                <td>{summary.returned}</td>
                <td className={summary.outstanding > 0 ? 'oor' : ''}>{summary.outstanding}</td>
                <td className="col-remark">
                  {summary.receivedSelfSupplied
                    ? `ส่งกลับ ${summary.received} ตัวอย่าง มี ${summary.receivedSelfSupplied} ตัวอย่างใช้ชุดตรวจของตัวเอง (ไม่หักยอดเบิก) จึงมีผลต่อยอดคงค้างเพียง ${summary.received - summary.receivedSelfSupplied} ตัวอย่าง`
                    : '-'}
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={7} className="empty">ยังไม่มีหน่วยงาน</td></tr> : null}
          </tbody>
          {rows.length ? (
            <tfoot>
              <tr>
                <td className="col-site">รวมทั้งหมด</td>
                <td>{totals.issued}</td>
                <td>{totals.received}</td>
                <td>{totals.receivedSelfSupplied || '-'}</td>
                <td>{totals.returned}</td>
                <td className={totals.outstanding > 0 ? 'oor' : ''}>{totals.outstanding}</td>
                <td className="col-remark">{totals.receivedSelfSupplied ? `รวมใช้ชุดตรวจของตัวเอง ${totals.receivedSelfSupplied} ตัวอย่าง` : '-'}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>

        <p className="footer-note">เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต</p>
      </section>

      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-report')?.addEventListener('click',()=>window.print())" }} />
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        body { background: #e9eef0; }
        .report-page { color: #111; font-family: "Noto Sans Thai", Arial, sans-serif; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin: 0 auto 12px; max-width: 1120px; }
        .back-link, #print-report { border: 1px solid #b8c8cc; background: white; border-radius: 6px; padding: 8px 12px; color: #173d50; font-weight: 700; font-size: 13px; }
        .sheet { position: relative; width: 1120px; min-height: 780px; margin: 0 auto; background: white; padding: 24px 28px; box-shadow: 0 10px 40px rgba(20, 64, 72, 0.16); }
        h1 { margin: 0; text-align: center; font-size: 19px; font-weight: 800; }
        .subhead { margin: 4px 0 0; text-align: center; font-size: 12px; }
        .meta { margin: 2px 0 12px; text-align: center; font-size: 11px; color: #55727c; }
        .remark { margin: 0 0 14px; padding: 8px 12px; background: #f7fafa; border: 1px solid #e1eaeb; border-radius: 6px; font-size: 11px; line-height: 1.5; color: #45636b; }
        .summary-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .summary-table th, .summary-table td { border: 1px solid #cfdde0; padding: 6px 8px; text-align: right; vertical-align: top; }
        .summary-table th { background: #f7fafa; font-weight: 700; text-align: center; font-size: 10px; }
        .col-site { text-align: left; width: 190px; }
        .col-remark { text-align: left; width: 260px; font-size: 10px; color: #45636b; }
        .site-name { font-weight: 700; }
        .site-meta { font-size: 10px; color: #789097; }
        .oor { color: #a9700f; font-weight: 700; }
        tfoot td { font-weight: 700; background: #fbfdfd; border-top: 2px solid #b8c8cc; }
        .empty { text-align: center; color: #91a4a9; padding: 24px; }
        .footer-note { position: absolute; bottom: 10px; left: 28px; right: 28px; margin: 0; text-align: center; font-size: 9px; }
        @media print {
          body { background: white; }
          .print-hidden { display: none !important; }
          .sheet { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
          .footer-note { position: fixed; bottom: 0; left: 0; right: 0; }
        }
      `}</style>
    </main>
  )
}
