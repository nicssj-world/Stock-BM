'use client'

import { useMemo, useState } from 'react'
import { AlertOctagon, ArrowUpRight, BarChart3, CalendarClock, ChevronLeft, ChevronRight, Download, FileDown, FileText, PackageSearch, Search } from 'lucide-react'
import type { StockItem, StockWorkspace } from '@/lib/bm/types'
import { formatDate, formatQuantity } from '@/lib/bm/rules'
import { Button, Card, Input, Select, StatusBadge } from '@/components/ui'

function downloadCsv(filename: string, rows: string[][]) {
  const bom = '﻿'
  const content = bom + rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsPanel({ stock }: { stock: StockWorkspace }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 xl:grid-cols-[1.18fr_.82fr]">
        <Card className="overflow-hidden rounded-2xl">
          <div className="border-b border-[#e2eceb] bg-[#f7fbfa] px-4 py-3.5 sm:px-5">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">Export center</p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="font-bold text-[#173d50]">รายงานพร้อมใช้งาน</h2><p className="mt-0.5 text-xs text-[#789097]">เลือกไฟล์ตามจุดประสงค์ แล้วดาวน์โหลดได้ทันที</p></div>
              <span className="mono rounded-full bg-[#e2f3f0] px-2.5 py-1 text-xs font-bold text-[#08766e]">3 formats</span>
            </div>
          </div>
          <div className="grid divide-y divide-[#e8f0ef] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <ReportCard title="Balance ledger" format="CSV" detail="ยอดตาม lot และ location" href="/api/stock/export?report=balances" icon={<FileDown />} tone="teal" />
            <ReportCard title="Movement ledger" format="CSV" detail="การรับ จ่าย ย้าย และปรับ" href="/api/stock/export?report=movements" icon={<BarChart3 />} tone="blue" />
            <ReportCard title="Compliance brief" format="PRINT / PDF" detail="รายงานภาษาไทยสำหรับบันทึกหลักฐาน" href="/reports/stock-summary" icon={<FileText />} tone="amber" />
          </div>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border-[#cbdeda] bg-[#f2faf8] p-5">
          <div className="absolute -top-12 -right-8 size-36 rounded-full border-[18px] border-[#d6eeea]" />
          <p className="relative text-[10px] font-bold tracking-[0.16em] text-[#08766e] uppercase">Reading the board</p>
          <h2 className="relative mt-1 font-bold text-[#173d50]">Export ให้ตรงกับงาน</h2>
          <ol className="relative mt-4 space-y-3 text-sm text-[#55727c]">
            <li className="flex gap-3"><span className="mono flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0b7f76] text-[10px] font-bold text-white">1</span><span><b className="text-[#315763]">Balance</b> สำหรับตรวจ stock ปัจจุบัน</span></li>
            <li className="flex gap-3"><span className="mono flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0b7f76] text-[10px] font-bold text-white">2</span><span><b className="text-[#315763]">Movement</b> สำหรับตามรายการเปลี่ยนแปลง</span></li>
            <li className="flex gap-3"><span className="mono flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0b7f76] text-[10px] font-bold text-white">3</span><span><b className="text-[#315763]">Compliance</b> สำหรับทบทวนความเสี่ยง</span></li>
          </ol>
        </Card>
      </section>
      <InventorySnapshot stock={stock} />
    </div>
  )
}

function ReportCard({ title, format, detail, href, icon, tone }: { title: string; format: string; detail: string; href: string; icon: React.ReactNode; tone: 'teal' | 'blue' | 'amber' }) {
  const toneClasses = {
    teal: 'bg-[#e6f5f2] text-[#08766e]',
    blue: 'bg-[#e9eff9] text-[#4568a3]',
    amber: 'bg-[#fff1d5] text-[#a76511]',
  }[tone]
  return (
    <button type="button" onClick={() => { window.location.href = href }} className="group flex min-h-44 flex-col p-4 text-left transition hover:bg-[#fbfefd] focus-visible:bg-[#fbfefd] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b7f76] focus-visible:outline-none">
      <div className="flex items-start justify-between gap-3"><span className={`flex size-9 items-center justify-center rounded-lg ${toneClasses} [&>svg]:size-4`}>{icon}</span><span className="mono rounded border border-[#dbe7e6] bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#617c84]">{format}</span></div>
      <h3 className="mt-4 font-bold text-[#173d50]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[#789097]">{detail}</p>
      <span className="mt-auto flex items-center gap-1 pt-4 text-xs font-bold text-[#0b7f76]">Download <ArrowUpRight className="size-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
    </button>
  )
}

function getItemStatus(item: StockItem) {
  if (item.isLowStock) return { label: 'LOW', tone: 'rejected' as const }
  if (item.lots.some((lot) => lot.expiryState === 'expired' && lot.totalOnHand > 0)) return { label: 'EXPIRED', tone: 'rejected' as const }
  if (item.lots.some((lot) => lot.expiryState === 'expiring' && lot.totalOnHand > 0)) return { label: 'EXPIRING', tone: 'warning' as const }
  return { label: 'OK', tone: 'accepted' as const }
}

function InventorySnapshot({ stock }: { stock: StockWorkspace }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const activeLocations = stock.locations.filter((location) => location.isActive)

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    return stock.items.filter((item) => item.isActive && (!term || `${item.itemCode} ${item.name} ${item.categoryName}`.toLowerCase().includes(term)))
  }, [stock.items, q])
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function updateQuery(value: string) {
    setQ(value)
    setPage(1)
  }

  function exportSnapshot() {
    const rows = [
      ['Item Code', 'Name', 'Category', 'Unit', 'Total on hand', 'Usable', 'Min stock', 'Status', ...activeLocations.map((location) => location.code)],
      ...items.map((item) => {
        const byLocation = getLocationBalances(item)
        return [item.itemCode, item.name, item.categoryName, item.unit, String(item.totalOnHand), String(item.usableOnHand), String(item.minimumStock), getItemStatus(item).label, ...activeLocations.map((location) => String(byLocation.get(location.id) ?? 0))]
      }),
    ]
    downloadCsv(`inventory_snapshot_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-[#e2eceb] bg-[#fbfdfd] px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">Live inventory</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2"><h2 className="font-bold text-[#173d50]">Inventory snapshot</h2><span className="text-xs text-[#789097]">{items.length} matching items</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1 sm:w-60"><Search className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" /><Input value={q} onChange={(event) => updateQuery(event.target.value)} className="pl-9" placeholder="ค้นหา item หรือหมวดหมู่" aria-label="Search inventory snapshot" /></div>
          <Button variant="secondary" onClick={exportSnapshot}><Download className="size-4" /> Export</Button>
        </div>
      </div>

      <div className="border-b border-[#e8f0ef] bg-[#f7fbfa] px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#617c84]">
          <span>แสดง <b className="text-[#315763]">{pageItems.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, items.length)}</b> จาก {items.length} รายการ</span>
          <label className="flex items-center gap-2">ต่อหน้า <Select value={String(pageSize)} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }} className="h-8 w-18 py-1 text-xs"><option value="10">10</option><option value="20">20</option><option value="50">50</option></Select></label>
        </div>
      </div>

      <div className="divide-y divide-[#edf2f2] md:hidden">
        {pageItems.map((item) => <SnapshotMobileRow key={item.id} item={item} />)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-5 py-3">Item</th><th className="px-3 py-3 text-right">On hand</th><th className="px-3 py-3 text-right">Usable</th><th className="px-3 py-3 text-right">Min</th>{activeLocations.map((location) => <th key={location.id} className="px-3 py-3 text-right">{location.code}</th>)}<th className="px-5 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-[#edf2f2]">
            {pageItems.map((item) => {
              const byLocation = getLocationBalances(item)
              const status = getItemStatus(item)
              return <tr key={item.id} className="transition hover:bg-[#f6fbfa]"><td className="px-5 py-3.5"><p className="mono text-xs font-bold text-[#173d50]">{item.itemCode}</p><p className="mt-0.5 font-semibold text-[#55727c]">{item.name}</p><p className="mt-0.5 text-[10px] text-[#91a3a7]">{item.categoryName}</p></td><td className="mono px-3 py-3 text-right font-bold text-[#355b66]">{formatQuantity(item.totalOnHand)}</td><td className={`mono px-3 py-3 text-right font-bold ${item.isLowStock ? 'text-[#be3d49]' : 'text-[#0b7f76]'}`}>{formatQuantity(item.usableOnHand)}</td><td className="px-3 py-3 text-right text-xs text-[#7e9297]">{formatQuantity(item.minimumStock)}</td>{activeLocations.map((location) => <td key={location.id} className={`mono px-3 py-3 text-right text-xs ${(byLocation.get(location.id) ?? 0) > 0 ? 'text-[#315763]' : 'text-[#c0cdd0]'}`}>{formatQuantity(byLocation.get(location.id) ?? 0)}</td>)}<td className="px-5 py-3"><StatusBadge tone={status.tone} label={status.label} /></td></tr>
            })}
          </tbody>
        </table>
      </div>
      {!items.length ? <p className="px-4 py-14 text-center text-sm text-[#91a4a9]">ไม่พบรายการที่ตรงกับคำค้น</p> : null}
      {items.length ? <Pagination page={currentPage} pages={pageCount} onChange={setPage} /> : null}
    </Card>
  )
}

function getLocationBalances(item: StockItem) {
  const balances = new Map<string, number>()
  for (const lot of item.lots) for (const balance of lot.balances) balances.set(balance.locationId, (balances.get(balance.locationId) ?? 0) + balance.onHand)
  return balances
}

function SnapshotMobileRow({ item }: { item: StockItem }) {
  const status = getItemStatus(item)
  return <article className="px-4 py-3.5"><div className="flex items-start justify-between gap-3"><div><p className="mono text-xs font-bold text-[#173d50]">{item.itemCode}</p><h3 className="mt-0.5 text-sm font-bold text-[#55727c]">{item.name}</h3><p className="mt-0.5 text-[11px] text-[#91a3a7]">{item.categoryName}</p></div><StatusBadge tone={status.tone} label={status.label} /></div><div className="mt-3 grid grid-cols-3 divide-x divide-[#dde9e8] rounded-lg border border-[#e1eceb] bg-[#f8fbfb] py-2 text-center"><Metric label="On hand" value={formatQuantity(item.totalOnHand)} /><Metric label="Usable" value={formatQuantity(item.usableOnHand)} emphasis={item.isLowStock} /><Metric label="Min" value={formatQuantity(item.minimumStock)} /></div></article>
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div><p className="text-[9px] font-bold tracking-[0.1em] text-[#91a3a7] uppercase">{label}</p><p className={`mono mt-0.5 text-sm font-bold ${emphasis ? 'text-[#be3d49]' : 'text-[#315763]'}`}>{value}</p></div>
}

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  return <div className="flex items-center justify-between border-t border-[#e6efee] px-4 py-3 sm:px-5"><span className="mono text-xs text-[#789097]">PAGE {page} / {pages}</span><div className="flex gap-1"><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => onChange(page - 1)} className="flex size-8 items-center justify-center rounded-md border border-[#d4e2e1] text-[#55727c] transition hover:bg-[#f1f8f7] disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft className="size-4" /></button><button type="button" aria-label="Next page" disabled={page === pages} onClick={() => onChange(page + 1)} className="flex size-8 items-center justify-center rounded-md border border-[#d4e2e1] text-[#55727c] transition hover:bg-[#f1f8f7] disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight className="size-4" /></button></div></div>
}

export function StockAlertsPanel({ stock }: { stock: StockWorkspace }) {
  const [daysWindow, setDaysWindow] = useState(60)
  const today = new Date().toISOString().slice(0, 10)
  const threshold = new Date()
  threshold.setDate(threshold.getDate() + daysWindow)
  const thresholdStr = threshold.toISOString().slice(0, 10)
  const lowItems = stock.items.filter((item) => item.isActive && item.isLowStock)
  const expiredLots = useMemo(() => stock.items.flatMap((item) => item.lots.map((lot) => ({ item, lot }))).filter(({ lot }) => lot.totalOnHand > 0 && lot.expiryState === 'expired').sort((a, b) => (a.lot.expiryDate ?? '').localeCompare(b.lot.expiryDate ?? '')), [stock.items])
  const expiringLots = useMemo(() => stock.items.flatMap((item) => item.lots.map((lot) => ({ item, lot }))).filter(({ lot }) => lot.totalOnHand > 0 && lot.expiryState !== 'expired' && lot.expiryDate && lot.expiryDate <= thresholdStr).sort((a, b) => (a.lot.expiryDate ?? '').localeCompare(b.lot.expiryDate ?? '')), [stock.items, thresholdStr])

  function exportAlerts() {
    const rows = [['Alert type', 'Item code', 'Item name', 'Lot', 'Expiry', 'On hand', 'Unit', 'Min stock'], ...expiredLots.map(({ item, lot }) => ['EXPIRED', item.itemCode, item.name, lot.lotNumber, lot.expiryDate ?? '', String(lot.totalOnHand), item.unit, '']), ...expiringLots.map(({ item, lot }) => ['EXPIRING', item.itemCode, item.name, lot.lotNumber, lot.expiryDate ?? '', String(lot.totalOnHand), item.unit, '']), ...lowItems.map((item) => ['LOW STOCK', item.itemCode, item.name, '', '', String(item.usableOnHand), item.unit, String(item.minimumStock)])]
    downloadCsv(`stock_alerts_${today}.csv`, rows)
  }

  const total = expiredLots.length + expiringLots.length + lowItems.length
  return <div className="space-y-4"><Card className="flex flex-col gap-4 rounded-2xl border-[#eeddbb] bg-[#fffdf8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="text-[10px] font-bold tracking-[0.16em] text-[#a76511] uppercase">Action queue</p><h2 className="mt-1 font-bold text-[#173d50]">{total ? `${total} รายการที่ต้องติดตาม` : 'ไม่มีรายการต้องติดตาม'}</h2><p className="mt-0.5 text-xs text-[#789097]">เรียงตามความเสี่ยง: หมดอายุ, ใกล้หมดอายุ, และต่ำกว่าขั้นต่ำ</p></div><div className="flex flex-wrap gap-2"><Select value={String(daysWindow)} onChange={(event) => setDaysWindow(Number(event.target.value))} className="w-32"><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></Select><Button variant="secondary" onClick={exportAlerts}><Download className="size-4" /> Export</Button></div></Card>{expiredLots.length > 0 ? <AlertSection title={`Expired lots · ${expiredLots.length}`} tone="danger" icon={<AlertOctagon />} rows={expiredLots.map(({ item, lot }) => ({ key: lot.id, primary: `${item.itemCode} · ${lot.lotNumber}`, secondary: item.name, meta: `EXP ${formatDate(lot.expiryDate)} · ${formatQuantity(lot.totalOnHand)} ${item.unit}`, badge: 'EXPIRED', badgeClass: 'bg-[#fff1f2] text-[#b33b46]' }))} /> : null}{expiringLots.length > 0 ? <AlertSection title={`Expiring within ${daysWindow} days · ${expiringLots.length}`} tone="amber" icon={<CalendarClock />} rows={expiringLots.map(({ item, lot }) => { const days = Math.round((new Date(`${lot.expiryDate!}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000); return { key: lot.id, primary: `${item.itemCode} · ${lot.lotNumber}`, secondary: item.name, meta: `EXP ${formatDate(lot.expiryDate)} · ${formatQuantity(lot.totalOnHand)} ${item.unit}`, badge: `${days}d`, badgeClass: 'bg-[#fff8e8] text-[#a76511]' } })} /> : null}{lowItems.length > 0 ? <AlertSection title={`Low stock · ${lowItems.length}`} tone="danger" icon={<PackageSearch />} rows={lowItems.map((item) => ({ key: item.id, primary: item.itemCode, secondary: item.name, meta: `${formatQuantity(item.usableOnHand)} / min ${formatQuantity(item.minimumStock)} ${item.unit}`, badge: 'LOW', badgeClass: 'bg-[#fff1f2] text-[#b33b46]' }))} /> : null}{!total ? <Card className="rounded-2xl p-10 text-center"><p className="text-sm text-[#55727c]">ทุก lot อยู่ในสถานะปกติ</p><p className="mt-1 text-xs text-[#91a4a9]">No stock alerts</p></Card> : null}</div>
}

function AlertSection({ title, tone, icon, rows }: { title: string; tone: 'danger' | 'amber'; icon: React.ReactNode; rows: { key: string; primary: string; secondary: string; meta: string; badge: string; badgeClass: string }[] }) {
  const headerBg = tone === 'danger' ? 'bg-[#fff8f8] border-[#f5d5d8]' : 'bg-[#fffdf7] border-[#f0dfc0]'
  const iconBg = tone === 'danger' ? 'bg-[#fff1f2] text-[#b33b46]' : 'bg-[#fff8e8] text-[#a76511]'
  return <Card className="overflow-hidden rounded-2xl"><div className={`flex items-center gap-2 border-b px-4 py-3 ${headerBg}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-md [&>svg]:size-4 ${iconBg}`}>{icon}</span><span className="font-bold text-[#173d50]">{title}</span></div><div className="divide-y divide-[#edf2f2]">{rows.map((row) => <div key={row.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="mono text-xs font-bold text-[#315763]">{row.primary}</p><p className="mt-0.5 font-semibold text-[#55727c]">{row.secondary}</p><p className="mt-0.5 text-xs text-[#789097]">{row.meta}</p></div><span className={`rounded px-2 py-1 text-[10px] font-bold ${row.badgeClass}`}>{row.badge}</span></div>)}</div></Card>
}
