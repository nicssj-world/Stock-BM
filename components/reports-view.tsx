'use client'

import { useMemo, useState } from 'react'
import { AlertOctagon, BarChart3, CalendarClock, Download, FileDown, FileText, PackageSearch, Search } from 'lucide-react'
import type { StockWorkspace } from '@/lib/bm/types'
import { formatDate, formatQuantity } from '@/lib/bm/rules'
import { Button, Card, Input, Select } from '@/components/ui'

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
    <div className="space-y-6">
      <section>
        <div className="mb-3"><p className="text-[10px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Operational reports</p><h2 className="mt-0.5 font-bold text-[#173d50]">Export เพื่อใช้งานประจำวัน</h2></div>
        <div className="grid gap-3 lg:grid-cols-2">
          <ReportCard title="Balances CSV" detail={`${stock.items.length} items · ราย lot และ location`} href="/api/stock/export?report=balances" icon={<FileDown />} tone="teal" />
          <ReportCard title="Movement CSV" detail={`${stock.transactions.length} transactions · ledger ที่โหลดแล้ว`} href="/api/stock/export?report=movements" icon={<BarChart3 />} tone="blue" />
        </div>
      </section>
      <section>
        <div className="mb-3"><p className="text-[10px] font-bold tracking-[0.14em] text-[#a76511] uppercase">Compliance report</p><h2 className="mt-0.5 font-bold text-[#173d50]">สรุปสถานะที่ต้องติดตาม</h2></div>
        <div className="grid gap-3 lg:grid-cols-2">
          <ReportCard title="Summary PDF" detail="Low stock และ expiry summary" href="/api/reports/stock-summary.pdf" icon={<FileText />} tone="amber" />
        </div>
      </section>
      <InventorySnapshot stock={stock} />
    </div>
  )
}

function ReportCard({ title, detail, href, icon, tone }: { title: string; detail: string; href: string; icon: React.ReactNode; tone: 'teal' | 'blue' | 'amber' }) {
  const toneClasses = { teal: 'border-[#c7e4df] bg-[#f5fcfa] text-[#0b7f76]', blue: 'border-[#cfdcf1] bg-[#f7f9ff] text-[#4568a3]', amber: 'border-[#eeddbb] bg-[#fffaf1] text-[#a76511]' }[tone]
  return (
    <Card className={`flex min-h-40 flex-col rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-4"><div className="flex size-10 items-center justify-center rounded-lg bg-white/80 shadow-sm [&>svg]:size-5">{icon}</div><span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-bold">CSV / PDF</span></div>
      <h2 className="mt-4 font-bold text-[#173d50]">{title}</h2>
      <p className="mt-1 text-sm text-[#617c84]">{detail}</p>
      <Button variant="secondary" className="mt-auto w-full border-white/80 bg-white/80" onClick={() => { window.location.href = href }}>Download report</Button>
    </Card>
  )
}

function InventorySnapshot({ stock }: { stock: StockWorkspace }) {
  const [q, setQ] = useState('')
  const activeLocations = stock.locations.filter((l) => l.isActive)

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    return stock.items.filter((item) => item.isActive && (!term || `${item.itemCode} ${item.name} ${item.categoryName}`.toLowerCase().includes(term)))
  }, [stock.items, q])

  function exportSnapshot() {
    const rows = [
      ['Item Code', 'Name', 'Category', 'Unit', 'Total on hand', 'Usable', 'Min stock', 'Status', ...activeLocations.map((l) => l.code)],
      ...items.map((item) => {
        const byLoc = new Map<string, number>()
        for (const lot of item.lots) for (const bal of lot.balances) byLoc.set(bal.locationId, (byLoc.get(bal.locationId) ?? 0) + bal.onHand)
        const status = item.isLowStock ? 'LOW' : item.lots.some((l) => l.expiryState === 'expired' && l.totalOnHand > 0) ? 'EXPIRED' : item.lots.some((l) => l.expiryState === 'expiring' && l.totalOnHand > 0) ? 'EXPIRING' : 'OK'
        return [item.itemCode, item.name, item.categoryName, item.unit, String(item.totalOnHand), String(item.usableOnHand), String(item.minimumStock), status, ...activeLocations.map((l) => String(byLoc.get(l.id) ?? 0))]
      }),
    ]
    downloadCsv(`inventory_snapshot_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-[#173d50]">Inventory Snapshot</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="ค้น item" />
          </div>
          <Button variant="secondary" onClick={exportSnapshot}><Download className="size-4" /> Export CSV</Button>
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase">
            <tr>
              <th className="px-4 py-2.5">Item</th>
              <th className="px-3 py-2.5 text-right">On hand</th>
              <th className="px-3 py-2.5 text-right">Usable</th>
              <th className="px-3 py-2.5 text-right">Min</th>
              {activeLocations.map((l) => <th key={l.id} className="px-3 py-2.5 text-right">{l.code}</th>)}
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f2]">
            {items.map((item) => {
              const byLoc = new Map<string, number>()
              for (const lot of item.lots) for (const bal of lot.balances) byLoc.set(bal.locationId, (byLoc.get(bal.locationId) ?? 0) + bal.onHand)
              const status = item.isLowStock ? 'LOW' : item.lots.some((l) => l.expiryState === 'expired' && l.totalOnHand > 0) ? 'EXPIRED' : item.lots.some((l) => l.expiryState === 'expiring' && l.totalOnHand > 0) ? 'EXPIRING' : 'OK'
              const statusClass = status === 'LOW' || status === 'EXPIRED' ? 'bg-[#fff1f2] text-[#b33b46]' : status === 'EXPIRING' ? 'bg-[#fff8e8] text-[#a76511]' : 'bg-[#eef8f5] text-[#0b7f76]'
              return (
                <tr key={item.id} className="hover:bg-[#f6fbfa]">
                  <td className="px-4 py-3">
                    <p className="mono text-xs font-bold text-[#173d50]">{item.itemCode}</p>
                    <p className="mt-0.5 font-semibold text-[#55727c]">{item.name}</p>
                    <p className="mt-0.5 text-[10px] text-[#91a3a7]">{item.categoryName}</p>
                  </td>
                  <td className="mono px-3 py-3 text-right font-bold text-[#355b66]">{formatQuantity(item.totalOnHand)}</td>
                  <td className={`mono px-3 py-3 text-right font-bold ${item.isLowStock ? 'text-[#be3d49]' : 'text-[#0b7f76]'}`}>{formatQuantity(item.usableOnHand)}</td>
                  <td className="px-3 py-3 text-right text-xs text-[#7e9297]">{formatQuantity(item.minimumStock)}</td>
                  {activeLocations.map((l) => (
                    <td key={l.id} className={`mono px-3 py-3 text-right text-xs ${(byLoc.get(l.id) ?? 0) > 0 ? 'text-[#315763]' : 'text-[#c0cdd0]'}`}>
                      {formatQuantity(byLoc.get(l.id) ?? 0)}
                    </td>
                  ))}
                  <td className="px-4 py-3"><span className={`rounded px-2 py-1 text-[10px] font-bold ${statusClass}`}>{status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!items.length ? <p className="px-4 py-14 text-center text-sm text-[#91a4a9]">ไม่พบรายการ</p> : null}
      </Card>
    </div>
  )
}

export function StockAlertsPanel({ stock }: { stock: StockWorkspace }) {
  const [daysWindow, setDaysWindow] = useState(60)
  const today = new Date().toISOString().slice(0, 10)
  const threshold = new Date()
  threshold.setDate(threshold.getDate() + daysWindow)
  const thresholdStr = threshold.toISOString().slice(0, 10)

  const lowItems = stock.items.filter((item) => item.isActive && item.isLowStock)

  const expiredLots = useMemo(
    () =>
      stock.items
        .flatMap((item) => item.lots.map((lot) => ({ item, lot })))
        .filter(({ lot }) => lot.totalOnHand > 0 && lot.expiryState === 'expired')
        .sort((a, b) => (a.lot.expiryDate ?? '').localeCompare(b.lot.expiryDate ?? '')),
    [stock.items],
  )

  const expiringLots = useMemo(
    () =>
      stock.items
        .flatMap((item) => item.lots.map((lot) => ({ item, lot })))
        .filter(({ lot }) => lot.totalOnHand > 0 && lot.expiryState !== 'expired' && lot.expiryDate && lot.expiryDate <= thresholdStr)
        .sort((a, b) => (a.lot.expiryDate ?? '').localeCompare(b.lot.expiryDate ?? '')),
    [stock.items, thresholdStr],
  )

  function exportAlerts() {
    const rows = [
      ['Alert type', 'Item code', 'Item name', 'Lot', 'Expiry', 'On hand', 'Unit', 'Min stock'],
      ...expiredLots.map(({ item, lot }) => ['EXPIRED', item.itemCode, item.name, lot.lotNumber, lot.expiryDate ?? '', String(lot.totalOnHand), item.unit, '']),
      ...expiringLots.map(({ item, lot }) => ['EXPIRING', item.itemCode, item.name, lot.lotNumber, lot.expiryDate ?? '', String(lot.totalOnHand), item.unit, '']),
      ...lowItems.map((item) => ['LOW STOCK', item.itemCode, item.name, '', '', String(item.usableOnHand), item.unit, String(item.minimumStock)]),
    ]
    downloadCsv(`stock_alerts_${today}.csv`, rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#173d50]">Expiry window:</span>
          <Select value={String(daysWindow)} onChange={(e) => setDaysWindow(Number(e.target.value))}>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </Select>
        </div>
        <Button variant="secondary" onClick={exportAlerts}><Download className="size-4" /> Export Alerts CSV</Button>
      </div>

      {expiredLots.length > 0 ? (
        <AlertSection
          title={`Expired lots with stock (${expiredLots.length})`}
          tone="danger"
          icon={<AlertOctagon />}
          rows={expiredLots.map(({ item, lot }) => ({
            key: lot.id,
            primary: `${item.itemCode} · ${lot.lotNumber}`,
            secondary: item.name,
            meta: `EXP ${formatDate(lot.expiryDate)} · ${formatQuantity(lot.totalOnHand)} ${item.unit}`,
            badge: 'EXPIRED',
            badgeClass: 'bg-[#fff1f2] text-[#b33b46]',
          }))}
        />
      ) : null}

      {expiringLots.length > 0 ? (
        <AlertSection
          title={`Expiring within ${daysWindow} days (${expiringLots.length})`}
          tone="amber"
          icon={<CalendarClock />}
          rows={expiringLots.map(({ item, lot }) => {
            const days = Math.round((new Date(`${lot.expiryDate!}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000)
            return {
              key: lot.id,
              primary: `${item.itemCode} · ${lot.lotNumber}`,
              secondary: item.name,
              meta: `EXP ${formatDate(lot.expiryDate)} · ${formatQuantity(lot.totalOnHand)} ${item.unit}`,
              badge: `${days}d`,
              badgeClass: 'bg-[#fff8e8] text-[#a76511]',
            }
          })}
        />
      ) : null}

      {lowItems.length > 0 ? (
        <AlertSection
          title={`Low stock items (${lowItems.length})`}
          tone="danger"
          icon={<PackageSearch />}
          rows={lowItems.map((item) => ({
            key: item.id,
            primary: item.itemCode,
            secondary: item.name,
            meta: `${formatQuantity(item.usableOnHand)} / min ${formatQuantity(item.minimumStock)} ${item.unit}`,
            badge: 'LOW',
            badgeClass: 'bg-[#fff1f2] text-[#b33b46]',
          }))}
        />
      ) : null}

      {!expiredLots.length && !expiringLots.length && !lowItems.length ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#91a4a9]">ไม่มี alerts — ทุก lot ปกติ / No stock alerts</p>
        </Card>
      ) : null}
    </div>
  )
}

function AlertSection({ title, tone, icon, rows }: {
  title: string
  tone: 'danger' | 'amber'
  icon: React.ReactNode
  rows: { key: string; primary: string; secondary: string; meta: string; badge: string; badgeClass: string }[]
}) {
  const headerBg = tone === 'danger' ? 'bg-[#fff8f8] border-[#f5d5d8]' : 'bg-[#fffdf7] border-[#f0dfc0]'
  const iconBg = tone === 'danger' ? 'bg-[#fff1f2] text-[#b33b46]' : 'bg-[#fff8e8] text-[#a76511]'
  return (
    <Card className="overflow-hidden">
      <div className={`flex items-center gap-2 border-b px-4 py-3 ${headerBg}`}>
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-md [&>svg]:size-4 ${iconBg}`}>{icon}</span>
        <span className="font-bold text-[#173d50]">{title}</span>
      </div>
      <div className="divide-y divide-[#edf2f2]">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="mono text-xs font-bold text-[#315763]">{row.primary}</p>
              <p className="mt-0.5 font-semibold text-[#55727c]">{row.secondary}</p>
              <p className="mt-0.5 text-xs text-[#789097]">{row.meta}</p>
            </div>
            <span className={`rounded px-2 py-1 text-[10px] font-bold ${row.badgeClass}`}>{row.badge}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
