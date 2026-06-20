'use client'

import { useMemo, useState } from 'react'
import { FileDown, History, PackageCheck, PackageSearch, Printer, RotateCcw } from 'lucide-react'
import type { BmActor, StockItem, StockLot, StockTransaction, StockWorkspace } from '@/lib/bm/types'
import { formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import { printLotLabel } from '@/lib/bm/label-print'
import { api, Button, Card, Input, Notice, PageHeader, Select } from '@/components/ui'

export function InventoryView({ actor, initialData }: { actor: BmActor; initialData: StockWorkspace }) {
  const [data, setData] = useState(initialData)
  const [selectedItemId, setSelectedItemId] = useState(initialData.items[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const visibleItems = useMemo(() => {
    const term = q.trim().toLowerCase()
    return data.items.filter((item) => {
      const matches = !term || `${item.itemCode} ${item.name} ${item.categoryName}`.toLowerCase().includes(term)
      const statusOk = status === 'all' || (status === 'low' && item.isLowStock) || (status === 'expiring' && item.lots.some((lot) => lot.expiryState === 'expiring')) || (status === 'expired' && item.lots.some((lot) => lot.expiryState === 'expired'))
      return matches && statusOk
    })
  }, [data.items, q, status])
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? null
  const itemTransactions = selectedItem ? data.transactions.filter((tx) => tx.lines.some((line) => line.itemId === selectedItem.id)) : []

  async function reverse(transaction: StockTransaction) {
    const reason = window.prompt(`Reverse ${transaction.transactionType}?`)
    if (!reason?.trim()) return
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/stock/transactions/${transaction.id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) })
      setData(result.stock)
      setNotice({ tone: 'success', text: 'Reverse transaction แล้ว' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Reverse ไม่สำเร็จ' })
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        eyebrow="Inventory ledger"
        title="คลังน้ำยา / Inventory"
        description="ยอดคงเหลือแยกตาม lot และ location พร้อม ledger แบบ append-only"
        actions={<div className="flex flex-wrap gap-2">{actor.role === 'Admin' ? <Button variant="secondary" onClick={() => { window.location.href = '/inventory/qr' }}><Printer className="size-4" /> พิมพ์ QR lot</Button> : null}<Button variant="secondary" onClick={() => { window.location.href = '/api/stock/export?report=balances' }}><FileDown className="size-4" /> Balances CSV</Button><Button variant="secondary" onClick={() => { window.location.href = '/api/stock/export?report=movements' }}><History className="size-4" /> Ledger CSV</Button></div>}
      />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Card className="overflow-hidden">
        <div className="grid gap-2 border-b border-[#e0e9ea] bg-[#fbfdfd] p-3 sm:grid-cols-[minmax(0,1fr)_170px]">
          <div className="relative"><PackageSearch className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" /><Input value={q} onChange={(event) => setQ(event.target.value)} className="pl-9" placeholder="ค้นหา item code, ชื่อ, หมวดหมู่" /></div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All status</option>
            <option value="low">Low stock</option>
            <option value="expiring">Expiring</option>
            <option value="expired">Expired</option>
          </Select>
        </div>
        <div className="grid min-h-[640px] xl:grid-cols-[minmax(520px,0.9fr)_minmax(0,1.1fr)]">
          <div className="overflow-x-auto border-b border-[#e0e9ea] xl:border-r xl:border-b-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-4 py-2.5">Item</th><th className="px-3 py-2.5 text-right">On hand</th><th className="px-3 py-2.5 text-right">Usable</th><th className="px-3 py-2.5">Minimum</th><th className="px-4 py-2.5">Status</th></tr></thead>
              <tbody className="divide-y divide-[#edf2f2]">
                {visibleItems.map((item) => <tr key={item.id} onClick={() => setSelectedItemId(item.id)} className={`cursor-pointer transition hover:bg-[#f6fbfa] ${selectedItem?.id === item.id ? 'bg-[#eef9f7]' : ''}`}>
                  <td className="px-4 py-3"><p className="mono text-xs font-bold text-[#173d50]">{item.itemCode}</p><p className="mt-1 font-semibold text-[#55727c]">{item.name}</p><p className="mt-0.5 text-[10px] text-[#91a3a7]">{item.categoryName}{item.isActive ? '' : ' · INACTIVE'}</p></td>
                  <td className="mono px-3 py-3 text-right font-bold text-[#355b66]">{formatQuantity(item.totalOnHand)}</td>
                  <td className={`mono px-3 py-3 text-right font-bold ${item.isLowStock ? 'text-[#be3d49]' : 'text-[#0b7f76]'}`}>{formatQuantity(item.usableOnHand)}</td>
                  <td className="px-3 py-3 text-xs text-[#7e9297]">{formatQuantity(item.minimumStock)} {item.unit}</td>
                  <td className="px-4 py-3"><ItemStatus item={item} /></td>
                </tr>)}
              </tbody>
            </table>
            {!visibleItems.length ? <p className="px-4 py-14 text-center text-sm text-[#91a4a9]">ไม่พบรายการ</p> : null}
          </div>
          <StockDetail actor={actor} item={selectedItem} transactions={itemTransactions} locations={data.locations} onReverse={reverse} />
        </div>
      </Card>
    </div>
  )
}

function StockDetail({ actor, item, transactions, locations, onReverse }: { actor: BmActor; item: StockItem | null; transactions: StockTransaction[]; locations: StockWorkspace['locations']; onReverse: (tx: StockTransaction) => void }) {
  if (!item) return <div className="flex min-h-[520px] items-center justify-center p-8 text-center"><div><PackageSearch className="mx-auto size-10 text-[#b6c6c9]" /><p className="mt-3 text-sm text-[#82979d]">ยังไม่มีสินค้า / No items</p></div></div>
  return <div className="min-w-0">
    <div className="border-b border-[#e0e9ea] bg-[linear-gradient(115deg,#fafdfe,#f0f9f7)] px-4 py-4">
      <p className="mono text-[11px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">{item.itemCode}</p>
      <h2 className="mt-1 text-xl font-bold text-[#173d50]">{item.name}</h2>
      <p className="mt-1 text-xs text-[#789097]">{item.categoryName} · {item.unit} · minimum {formatQuantity(item.minimumStock)} · expiry warn {item.expiryWarningDays} days</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="On hand" value={`${formatQuantity(item.totalOnHand)} ${item.unit}`} />
        <MiniStat label="Usable" value={`${formatQuantity(item.usableOnHand)} ${item.unit}`} accent={item.isLowStock} />
        <MiniStat label="Lot tracking" value={item.trackLot ? 'เปิด / On' : 'ปิด / Off'} />
        <MiniStat label="Expiry" value={item.trackExpiry ? 'เปิด / On' : 'ปิด / Off'} />
      </div>
    </div>
    <section className="border-b border-[#e0e9ea] px-4 py-4">
      <div className="flex items-center justify-between"><h3 className="font-bold text-[#173d50]">Lots / Location balances</h3><PackageCheck className="size-5 text-[#0b7f76]" /></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {item.lots.map((lot) => <LotCard key={lot.id} lot={lot} item={item} locations={locations} />)}
        {!item.lots.length ? <p className="col-span-full rounded-md border border-dashed border-[#d5e2e3] px-3 py-7 text-center text-sm text-[#91a4a9]">ยังไม่มี Lot รับเข้า</p> : null}
      </div>
    </section>
    <section>
      <div className="flex items-center gap-2 border-b border-[#edf2f2] px-4 py-3"><History className="size-4 text-[#0b7f76]" /><h3 className="font-bold text-[#173d50]">Movement ledger</h3></div>
      <div className="max-h-[360px] overflow-y-auto">
        {transactions.map((transaction) => <TransactionRow key={transaction.id} actor={actor} transaction={transaction} onReverse={() => onReverse(transaction)} />)}
        {!transactions.length ? <p className="px-4 py-8 text-center text-sm text-[#91a4a9]">ยังไม่มี transaction</p> : null}
      </div>
    </section>
  </div>
}

function LotCard({ lot, item, locations }: { lot: StockLot; item: StockItem; locations: StockWorkspace['locations'] }) {
  const color = lot.expiryState === 'expired' ? 'border-[#efc7cc] bg-[#fff8f8]' : lot.expiryState === 'expiring' ? 'border-[#eed4a6] bg-[#fffdf7]' : 'border-[#d8e6e6] bg-white'
  return <div className={`rounded-md border p-3 ${color}`}>
    <div className="flex items-start justify-between gap-2"><div><p className="mono text-xs font-bold text-[#315763]">{lot.lotNumber}</p><p className="mt-1 text-[11px] text-[#8b9da2]">EXP {formatDate(lot.expiryDate)}</p></div><ExpiryBadge state={lot.expiryState} /></div>
    <p className="mono mt-3 text-lg font-bold text-[#173d50]">{formatQuantity(lot.totalOnHand)} <span className="text-[11px] font-semibold text-[#789097]">{item.unit}</span></p>
    <div className="mt-2 space-y-1">{lot.balances.map((balance) => <p key={balance.locationId} className="flex justify-between text-[11px] text-[#6f868b]"><span>{balance.locationCode}</span><span className="mono">{formatQuantity(balance.onHand)}</span></p>)}</div>
    <Button variant="ghost" className="mt-2 px-2 py-1 text-xs" onClick={() => printLotLabel(lot, item, locations.find((location) => location.id === lot.balances[0]?.locationId))}><Printer className="size-3" /> Label</Button>
  </div>
}

function TransactionRow({ actor, transaction, onReverse }: { actor: BmActor; transaction: StockTransaction; onReverse: () => void }) {
  const first = transaction.lines[0]
  return <div className="border-b border-[#edf2f2] px-4 py-3 last:border-0">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><div className="flex flex-wrap items-center gap-2"><MovementBadge type={transaction.transactionType} /><span className="mono text-xs font-bold text-[#55727c]">{first?.lotNumber ?? '-'}</span>{transaction.reversedByTransactionId ? <span className="rounded bg-[#f2f5f5] px-1.5 py-0.5 text-[9px] font-bold text-[#87999e]">REVERSED</span> : null}</div><p className="mt-1 text-[11px] text-[#91a3a7]">{formatDateTime(transaction.createdAt)} · {transaction.createdByName ?? '-'}</p></div>
      <div className="text-right">{transaction.lines.map((line, index) => <p key={index} className={`mono text-sm font-bold ${line.quantity > 0 ? 'text-[#0b7f76]' : 'text-[#be3d49]'}`}>{line.quantity > 0 ? '+' : ''}{formatQuantity(line.quantity)} {line.unit} · {line.locationCode}</p>)}{actor.role === 'Admin' && transaction.canReverse ? <button onClick={onReverse} className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#789097] hover:text-[#be3d49]"><RotateCcw className="size-3" /> Reverse</button> : null}</div>
    </div>
    {transaction.purpose || transaction.reference || transaction.note ? <p className="mt-2 text-[11px] leading-5 text-[#7f9398]">{transaction.purpose ? `Purpose: ${transaction.purpose}` : ''}{transaction.reference ? ` · Ref: ${transaction.reference}` : ''}{transaction.note ? ` · ${transaction.note}` : ''}</p> : null}
  </div>
}

function ItemStatus({ item }: { item: StockItem }) {
  if (item.lots.some((lot) => lot.totalOnHand > 0 && lot.expiryState === 'expired')) return <span className="rounded bg-[#fff1f2] px-2 py-1 text-[10px] font-bold text-[#b33b46]">EXPIRED</span>
  if (item.isLowStock) return <span className="rounded bg-[#fff1f2] px-2 py-1 text-[10px] font-bold text-[#b33b46]">LOW</span>
  if (item.lots.some((lot) => lot.totalOnHand > 0 && lot.expiryState === 'expiring')) return <span className="rounded bg-[#fff8e8] px-2 py-1 text-[10px] font-bold text-[#a76511]">EXPIRING</span>
  return <span className="rounded bg-[#eef8f5] px-2 py-1 text-[10px] font-bold text-[#0b7f76]">OK</span>
}

function ExpiryBadge({ state }: { state: StockLot['expiryState'] }) {
  const text = state === 'expired' ? 'Expired' : state === 'expiring' ? 'Expiring' : state === 'none' ? 'No expiry' : 'OK'
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${state === 'expired' ? 'bg-[#fff1f2] text-[#b33b46]' : state === 'expiring' ? 'bg-[#fff8e8] text-[#a76511]' : 'bg-[#eef8f5] text-[#0b7f76]'}`}>{text}</span>
}

function MovementBadge({ type }: { type: StockTransaction['transactionType'] }) {
  const styles = { receive: 'bg-[#eef8f5] text-[#0b7f76]', issue: 'bg-[#fff1f2] text-[#b33b46]', move: 'bg-[#eef3ff] text-[#4568a3]', adjustment: 'bg-[#fff8e8] text-[#a76511]', reversal: 'bg-[#f2f5f5] text-[#6d8085]' }
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${styles[type]}`}>{type}</span>
}

function MiniStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-md border border-[#dbe7e8] bg-white/80 px-3 py-2"><p className="text-[9px] font-bold tracking-[0.1em] text-[#91a3a7] uppercase">{label}</p><p className={`mono mt-1 text-xs font-bold ${accent ? 'text-[#be3d49]' : 'text-[#41616b]'}`}>{value}</p></div>
}

