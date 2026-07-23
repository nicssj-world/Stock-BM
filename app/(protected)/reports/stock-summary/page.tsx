import Link from 'next/link'
import { formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import type { StockItem } from '@/lib/bm/types'
import { requireFullPageActor } from '@/lib/server/auth'
import { getStockWorkspace } from '@/lib/server/stock'

type RiskTone = 'danger' | 'warning' | 'low'

function printedAt() {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date())
}

function atRiskLots(item: StockItem) {
  return item.lots
    .filter((lot) => lot.totalOnHand > 0 && (lot.expiryState === 'expired' || lot.expiryState === 'expiring'))
    .sort((a, b) => (a.expiryDate ?? '9999-12-31').localeCompare(b.expiryDate ?? '9999-12-31'))
}

function riskTags(item: StockItem) {
  const lots = atRiskLots(item)
  const tags: { label: string; tone: RiskTone }[] = []
  if (lots.some((lot) => lot.expiryState === 'expired')) tags.push({ label: 'หมดอายุ', tone: 'danger' })
  if (lots.some((lot) => lot.expiryState === 'expiring')) tags.push({ label: 'ใกล้หมดอายุ', tone: 'warning' })
  if (item.isLowStock) tags.push({ label: 'ต่ำกว่าขั้นต่ำ', tone: 'low' })
  return tags
}

export default async function StockSummaryReportPage() {
  const actor = await requireFullPageActor()
  const stock = await getStockWorkspace(actor)
  const riskItems = stock.items
    .filter((item) => item.isActive && (item.isLowStock || atRiskLots(item).length > 0))
    .sort((a, b) => {
      const score = (item: StockItem) => (atRiskLots(item).some((lot) => lot.expiryState === 'expired') ? 0 : atRiskLots(item).length ? 1 : 2)
      return score(a) - score(b) || a.itemCode.localeCompare(b.itemCode)
    })
  const recentTransactions = stock.transactions.slice(0, 15)

  return (
    <main className="stock-report-page">
      <div className="stock-report-toolbar print-hidden">
        <Link href="/reports" className="stock-report-back">กลับ Reports</Link>
        <button id="print-stock-report" type="button">Print / Save PDF</button>
      </div>

      <section className="stock-report-sheet">
        <header className="stock-report-heading">
          <div>
            <p className="stock-report-kicker">Molecular Biology · Stock Control</p>
            <h1>รายงานสรุปสถานะคลังและความเสี่ยง</h1>
            <p>BM Stock Compliance Brief</p>
          </div>
          <dl className="stock-report-meta">
            <div><dt>จัดทำเมื่อ</dt><dd>{printedAt()}</dd></div>
            <div><dt>ผู้จัดทำ</dt><dd>{actor.displayName} ({actor.ephisId})</dd></div>
          </dl>
        </header>

        <section className="stock-report-summary" aria-label="Stock summary">
          <SummaryMetric label="รายการที่ใช้งาน" value={stock.activeItemCount} detail="Active items" />
          <SummaryMetric label="ต่ำกว่าขั้นต่ำ" value={stock.lowStockItemCount} detail="Low stock" tone="danger" />
          <SummaryMetric label="ใกล้หมดอายุ" value={stock.expiringLotCount} detail="Expiring lots" tone="warning" />
          <SummaryMetric label="หมดอายุ" value={stock.expiredLotCount} detail="Expired lots" tone="danger" />
          <SummaryMetric label="จุดจัดเก็บ" value={stock.locationCount} detail="Active locations" />
        </section>

        <section className="stock-report-section">
          <div className="stock-report-section-heading">
            <div><p>Action queue</p><h2>รายการที่ต้องติดตาม</h2></div>
            <span>{riskItems.length} รายการ</span>
          </div>
          <table className="stock-report-table stock-report-risk-table">
            <thead><tr><th>รายการ</th><th>ยอดใช้ได้</th><th>ขั้นต่ำ</th><th>Lot / วันหมดอายุ</th><th>สถานะที่ต้องดำเนินการ</th></tr></thead>
            <tbody>
              {riskItems.map((item) => {
                const lots = atRiskLots(item)
                const tags = riskTags(item)
                return <tr key={item.id}><td><b>{item.itemCode}</b><span>{item.name}</span><small>{item.categoryName} · {item.unit}</small></td><td className={item.isLowStock ? 'quantity danger' : 'quantity'}>{formatQuantity(item.usableOnHand)} {item.unit}</td><td className="quantity">{formatQuantity(item.minimumStock)} {item.unit}</td><td>{lots.length ? lots.map((lot) => <div key={lot.id} className="lot-line"><b>{lot.lotNumber}</b><span>EXP {formatDate(lot.expiryDate)} · {formatQuantity(lot.totalOnHand)} {item.unit}</span></div>) : <span className="muted">ไม่มี lot ใกล้หมดอายุ</span>}</td><td><div className="risk-tags">{tags.map((tag) => <span key={tag.label} className={`risk-tag ${tag.tone}`}>{tag.label}</span>)}</div></td></tr>
              })}
              {!riskItems.length ? <tr><td colSpan={5} className="stock-report-empty">ไม่พบรายการที่ต้องติดตาม ณ เวลาที่สร้างรายงาน</td></tr> : null}
            </tbody>
          </table>
        </section>

        <section className="stock-report-section stock-report-transactions">
          <div className="stock-report-section-heading"><div><p>Traceability</p><h2>รายการเคลื่อนไหวล่าสุด</h2></div><span>{recentTransactions.length} รายการล่าสุด</span></div>
          <table className="stock-report-table">
            <thead><tr><th>วันเวลา</th><th>ประเภท</th><th>รายการ / Lot</th><th>ปริมาณ</th><th>อ้างอิง / วัตถุประสงค์</th><th>ผู้ดำเนินการ</th></tr></thead>
            <tbody>
              {recentTransactions.map((transaction) => <tr key={transaction.id}><td>{formatDateTime(transaction.createdAt)}</td><td><span className="transaction-type">{transaction.transactionType}</span></td><td>{transaction.lines.length ? transaction.lines.map((line) => <div key={`${line.lotId}-${line.locationId}`} className="transaction-line"><b>{line.itemCode}</b> · {line.lotNumber}<span>{line.locationCode}</span></div>) : <span className="muted">-</span>}</td><td className="quantity">{transaction.lines.map((line) => <div key={`${line.lotId}-${line.locationId}`}>{formatQuantity(line.quantity)} {line.unit}</div>)}</td><td>{transaction.reference ?? transaction.purpose ?? transaction.note ?? '-'}</td><td>{transaction.createdByName ?? '-'}</td></tr>)}
              {!recentTransactions.length ? <tr><td colSpan={6} className="stock-report-empty">ยังไม่มีรายการเคลื่อนไหว</td></tr> : null}
            </tbody>
          </table>
        </section>

        <footer className="stock-report-footer">เอกสารนี้สร้างจากข้อมูลคลัง ณ เวลาที่ระบุ · ใช้สำหรับทบทวนสถานะและติดตามความเสี่ยงของ stock</footer>
      </section>

      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-stock-report')?.addEventListener('click',()=>window.print())" }} />
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        body { background: #e9eef0; }
        .stock-report-page { color: #173d50; font-family: "Noto Sans Thai", sans-serif; }
        .stock-report-toolbar { display: flex; align-items: center; justify-content: space-between; max-width: 1120px; margin: 0 auto 12px; }
        .stock-report-back, #print-stock-report { border: 1px solid #b8c8cc; background: white; border-radius: 7px; padding: 8px 12px; color: #173d50; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; }
        #print-stock-report { background: #0b7f76; border-color: #0b7f76; color: white; }
        .stock-report-sheet { width: 1120px; min-height: 780px; margin: 0 auto; padding: 28px; background: white; box-shadow: 0 10px 40px rgba(20,64,72,.16); }
        .stock-report-heading { display: flex; justify-content: space-between; gap: 28px; padding-bottom: 18px; border-bottom: 2px solid #123944; }
        .stock-report-kicker, .stock-report-section-heading p { margin: 0; color: #0b7f76; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
        .stock-report-heading h1 { margin: 5px 0 1px; font-size: 23px; line-height: 1.25; }
        .stock-report-heading p:not(.stock-report-kicker) { margin: 0; font-size: 12px; color: #55727c; }
        .stock-report-meta { display: grid; align-content: start; gap: 5px; margin: 0; min-width: 265px; font-size: 11px; }
        .stock-report-meta div { display: grid; grid-template-columns: 75px 1fr; gap: 8px; }
        .stock-report-meta dt { color: #789097; }.stock-report-meta dd { margin: 0; font-weight: 700; text-align: right; }
        .stock-report-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 16px 0; }
        .stock-report-summary > div { border: 1px solid #d8e5e4; border-top: 4px solid #315763; padding: 10px 12px; background: #fbfdfd; }
        .stock-report-summary > div.danger { border-top-color: #b33b46; background: #fffafb; }.stock-report-summary > div.warning { border-top-color: #a76511; background: #fffdf8; }
        .stock-report-summary dt { font-size: 10px; font-weight: 700; color: #55727c; }.stock-report-summary dd { margin: 4px 0 0; font-family: "IBM Plex Mono", monospace; font-size: 25px; font-weight: 800; }.stock-report-summary small { color: #91a3a7; font-size: 9px; }
        .stock-report-section { margin-top: 17px; break-inside: avoid; page-break-inside: avoid; }.stock-report-transactions { break-before: auto; }
        .stock-report-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 7px; }.stock-report-section-heading h2 { margin: 2px 0 0; font-size: 15px; }.stock-report-section-heading > span { color: #55727c; font-size: 11px; }
        .stock-report-table { width: 100%; border-collapse: collapse; font-size: 10px; }.stock-report-table thead { display: table-header-group; }.stock-report-table tr { break-inside: avoid; page-break-inside: avoid; }.stock-report-table th, .stock-report-table td { border: 1px solid #cfdde0; padding: 6px 7px; vertical-align: top; text-align: left; }.stock-report-table th { background: #edf6f5; color: #315763; font-size: 9px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }.stock-report-table tbody tr:nth-child(even) { background: #fbfdfd; }
        .stock-report-risk-table td:first-child { width: 25%; }.stock-report-risk-table td:nth-child(2), .stock-report-risk-table td:nth-child(3) { width: 10%; }.stock-report-risk-table td:nth-child(4) { width: 28%; }.stock-report-table td b { display: block; color: #173d50; }.stock-report-table td > span { display: block; margin-top: 1px; }.stock-report-table small { display: block; margin-top: 2px; color: #789097; font-size: 9px; }
        .quantity { font-family: "IBM Plex Mono", monospace; text-align: right !important; white-space: nowrap; }.quantity.danger { color: #b33b46; font-weight: 800; }.lot-line + .lot-line, .transaction-line + .transaction-line { margin-top: 4px; }.lot-line b { display: inline; }.lot-line span, .transaction-line span { display: inline; margin-left: 4px; color: #789097; }.risk-tags { display: flex; flex-wrap: wrap; gap: 4px; }.risk-tag, .transaction-type { display: inline-block; border-radius: 999px; padding: 2px 6px; font-size: 9px; font-weight: 800; white-space: nowrap; }.risk-tag.danger { background: #fff0f1; color: #b33b46; }.risk-tag.warning { background: #fff6e6; color: #a76511; }.risk-tag.low { background: #f3eefc; color: #68529c; }.transaction-type { background: #edf6f5; color: #315763; text-transform: capitalize; }.muted { color: #91a3a7; }.stock-report-empty { padding: 18px !important; text-align: center !important; color: #789097; }.stock-report-footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #dce7e6; color: #789097; font-size: 9px; text-align: center; }
        @media print { body { background: white; }.print-hidden { display: none !important; }.stock-report-sheet { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }.stock-report-section { break-inside: avoid; page-break-inside: avoid; }.stock-report-footer { position: fixed; bottom: 0; left: 0; right: 0; } }
      `}</style>
    </main>
  )
}

function SummaryMetric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: 'danger' | 'warning' }) {
  return <div className={tone ?? ''}><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></div>
}
