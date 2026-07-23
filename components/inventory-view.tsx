'use client'

import { useMemo, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, FileDown, History, MoveRight, PackageCheck, PackageSearch, Printer, RotateCcw, X } from 'lucide-react'
import type { BmActor, StockItem, StockLot, StockTransaction, StockWorkspace } from '@/lib/bm/types'
import { formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import { printLotLabel } from '@/lib/bm/label-print'
import { api, Button, Card, Input, Notice, PageHeader, Select } from '@/components/ui'
import { Pagination, usePagination } from '@/components/pagination'
import { StockMetric, StockMetricStrip, StockModuleShell, StockPanelTitle } from '@/components/stock-module-shell'

const INVENTORY_PAGE_SIZE = 8

export function InventoryView({ actor, initialData, defaultLocationId }: { actor: BmActor; initialData: StockWorkspace; defaultLocationId?: string }) {
  const [data, setData] = useState(initialData)
  const [selectedItemId, setSelectedItemId] = useState(initialData.items[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [locationFilter, setLocationFilter] = useState(defaultLocationId && initialData.locations.some((location) => location.id === defaultLocationId) ? defaultLocationId : 'all')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [actionLot, setActionLot] = useState<{ item: StockItem; lot: StockLot } | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  const visibleItems = useMemo(() => {
    const term = q.trim().toLowerCase()
    return data.items.filter((item) => {
      const matches = !term || `${item.itemCode} ${item.name} ${item.categoryName}`.toLowerCase().includes(term)
      const statusOk = status === 'all' || (status === 'low' && item.isLowStock) || (status === 'expiring' && item.lots.some((lot) => lot.expiryState === 'expiring')) || (status === 'expired' && item.lots.some((lot) => lot.expiryState === 'expired'))
      const locationOk = locationFilter === 'all' || item.lots.some((lot) => lot.balances.some((balance) => balance.locationId === locationFilter && balance.onHand > 0))
      return matches && statusOk && locationOk
    })
  }, [data.items, locationFilter, q, status])
  const itemPagination = usePagination(visibleItems.length, INVENTORY_PAGE_SIZE)
  const pagedItems = visibleItems.slice(itemPagination.start, itemPagination.end)
  const selectedItem = visibleItems.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? null
  const itemTransactions = selectedItem ? data.transactions.filter((tx) => tx.lines.some((line) => line.itemId === selectedItem.id)) : []

  function selectItem(item: StockItem) {
    setSelectedItemId(item.id)
    const index = visibleItems.findIndex((candidate) => candidate.id === item.id)
    if (index >= 0) itemPagination.setPage(Math.floor(index / INVENTORY_PAGE_SIZE) + 1)
  }

  function filterByStatus(nextStatus: string) {
    setStatus(nextStatus)
    itemPagination.setPage(1)
  }

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
    <StockModuleShell className="pb-28 lg:pb-0">
      <PageHeader
        eyebrow="Stock control / live balance"
        title="คลังน้ำยา / Inventory"
        description="ควบคุมยอดคงเหลือราย item, lot และ location พร้อม action ที่ต้องทำทันที"
        actions={<div className="flex flex-wrap gap-2"><Button onClick={() => { window.location.href = '/movements?mode=receive' }}><ArrowDownToLine className="size-4" /> รับเข้า</Button><Button variant="secondary" onClick={() => { window.location.href = '/movements?mode=issue' }}><ArrowUpFromLine className="size-4" /> ตัด stock</Button>{actor.role === 'Admin' ? <Button variant="ghost" onClick={() => { window.location.href = '/inventory/qr' }}><Printer className="size-4" /> QR</Button> : null}</div>}
      />
      <StockMetricStrip>
        <StockMetric label="Active items" value={data.activeItemCount} detail="รายการที่เปิดใช้งาน" tone="neutral" onClick={() => filterByStatus('all')} active={status === 'all'} />
        <StockMetric label="Low stock" value={data.lowStockItemCount} detail="ต่ำกว่าขั้นต่ำ" tone={data.lowStockItemCount ? 'danger' : 'ok'} onClick={() => filterByStatus('low')} active={status === 'low'} />
        <StockMetric label="Expiring" value={data.expiringLotCount} detail="lot ใกล้หมดอายุ" tone={data.expiringLotCount ? 'warning' : 'ok'} onClick={() => filterByStatus('expiring')} active={status === 'expiring'} />
        <StockMetric label="Expired" value={data.expiredLotCount} detail="lot หมดอายุคงเหลือ" tone={data.expiredLotCount ? 'danger' : 'ok'} onClick={() => filterByStatus('expired')} active={status === 'expired'} />
      </StockMetricStrip>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Card className="overflow-hidden rounded-xl">
        <div className="grid gap-2 border-b border-[#e0e9ea] bg-[#f8fcfb] p-3 lg:grid-cols-[minmax(0,1fr)_170px_190px_auto]">
          <div className="relative"><PackageSearch className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" /><Input value={q} onChange={(event) => setQ(event.target.value)} className="pl-9" placeholder="ค้นหา item code, ชื่อ, หมวดหมู่" /></div>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All status</option>
            <option value="low">Low stock</option>
            <option value="expiring">Expiring</option>
            <option value="expired">Expired</option>
          </Select>
          <Select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
            <option value="all">All locations</option>
            {data.locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
          </Select>
          <div className="hidden items-center justify-end gap-1 lg:flex"><Button variant="ghost" className="px-2" onClick={() => { window.location.href = '/api/stock/export?report=balances' }} title="Export balances"><FileDown className="size-4" /></Button><Button variant="ghost" className="px-2" onClick={() => { window.location.href = '/api/stock/export?report=movements' }} title="Export movements"><History className="size-4" /></Button></div>
        </div>
        <MobileInventoryList
          items={pagedItems}
          selectedItemId={selectedItem?.id ?? ''}
          onSelect={(id) => {
            const item = visibleItems.find((candidate) => candidate.id === id)
            if (item) selectItem(item)
          }}
          onLotAction={setActionLot}
          onOpenDetail={() => setMobileDetailOpen(true)}
        />
        {visibleItems.length > INVENTORY_PAGE_SIZE ? <div className="border-t border-[#e0e9ea] xl:hidden"><Pagination {...itemPagination} total={visibleItems.length} onChange={itemPagination.setPage} /></div> : null}
        <div className="hidden min-h-[680px] xl:grid xl:grid-cols-[minmax(380px,0.78fr)_minmax(0,1.22fr)]">
          <div className="overflow-hidden border-b border-[#e0e9ea] xl:border-r xl:border-b-0">
            <StockPanelTitle eyebrow="Inventory navigator" title={`${visibleItems.length} items`} action={<span className="text-xs text-[#789097]">หน้า {itemPagination.page}/{itemPagination.pageCount}</span>} />
            <table className="w-full table-fixed text-left text-sm">
              <colgroup><col className="w-[46%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[17%]" /><col className="w-[13%]" /></colgroup>
              <thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-3 py-2.5">Item</th><th className="px-1.5 py-2.5 text-right">On hand</th><th className="px-1.5 py-2.5 text-right">Usable</th><th className="px-2 py-2.5">Minimum</th><th className="px-2 py-2.5 text-center">Status</th></tr></thead>
              <tbody className="divide-y divide-[#edf2f2]">
                {pagedItems.map((item) => <tr key={item.id} onClick={() => selectItem(item)} className={`cursor-pointer transition hover:bg-[#f6fbfa] ${selectedItem?.id === item.id ? 'bg-[#eef9f7]' : ''}`}>
                  <td className="px-3 py-3"><p className="mono text-xs font-bold text-[#173d50]">{item.itemCode}</p><p className="mt-1 truncate font-semibold text-[#55727c]" title={item.name}>{item.name}</p><p className="mt-0.5 truncate text-[10px] text-[#91a3a7]">{item.categoryName}{item.isActive ? '' : ' · INACTIVE'}</p></td>
                  <td className="mono whitespace-nowrap px-1.5 py-3 text-right font-bold text-[#355b66]">{formatQuantity(item.totalOnHand)}</td>
                  <td className={`mono whitespace-nowrap px-1.5 py-3 text-right font-bold ${item.isLowStock ? 'text-[#be3d49]' : 'text-[#0b7f76]'}`}>{formatQuantity(item.usableOnHand)}</td>
                  <td className="whitespace-nowrap px-2 py-3 text-xs text-[#7e9297]">{formatQuantity(item.minimumStock)} {item.unit}</td>
                  <td className="px-2 py-3 text-center"><ItemStatus item={item} /></td>
                </tr>)}
              </tbody>
            </table>
            {!visibleItems.length ? <p className="px-4 py-14 text-center text-sm text-[#91a4a9]">ไม่พบรายการ</p> : null}
            {visibleItems.length > INVENTORY_PAGE_SIZE ? <Pagination {...itemPagination} total={visibleItems.length} onChange={itemPagination.setPage} /> : null}
          </div>
          <div className="xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:self-start xl:overflow-y-auto"><StockDetail actor={actor} item={selectedItem} transactions={itemTransactions} locations={data.locations} onReverse={reverse} onLotAction={setActionLot} /></div>
        </div>
      </Card>
      {mobileDetailOpen && selectedItem ? <MobileItemDetailDrawer actor={actor} item={selectedItem} transactions={itemTransactions} locations={data.locations} onReverse={reverse} onLotAction={setActionLot} onClose={() => setMobileDetailOpen(false)} /> : null}
      {actionLot ? <LotActionSheet item={actionLot.item} lot={actionLot.lot} locations={data.locations} onClose={() => setActionLot(null)} /> : null}
    </StockModuleShell>
  )
}

function MobileInventoryList({
  items,
  selectedItemId,
  onSelect,
  onLotAction,
  onOpenDetail,
}: {
  items: StockItem[]
  selectedItemId: string
  onSelect: (id: string) => void
  onLotAction: (value: { item: StockItem; lot: StockLot }) => void
  onOpenDetail: () => void
}) {
  return (
    <div className="grid gap-2 p-3 xl:hidden">
      {items.map((item) => {
        const selected = item.id === selectedItemId
        return (
          <div key={item.id} className={`rounded-md border ${selected ? 'border-[#0b7f76] bg-[#f5fcfb]' : 'border-[#d8e6e6] bg-white'}`}>
            <button type="button" onClick={() => onSelect(item.id)} className="flex min-h-20 w-full items-center justify-between gap-3 px-3 py-3 text-left">
              <span className="min-w-0">
                <span className="mono block text-xs font-bold text-[#173d50]">{item.itemCode}</span>
                <span className="mt-0.5 block font-semibold text-[#55727c]">{item.name}</span>
                <span className="mt-0.5 block text-[11px] text-[#91a3a7]">{item.categoryName}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`mono block text-lg font-bold ${item.isLowStock ? 'text-[#be3d49]' : 'text-[#0b7f76]'}`}>{formatQuantity(item.usableOnHand)}</span>
                <span className="block text-[10px] font-semibold text-[#789097]">{item.unit}</span>
              </span>
            </button>
            {selected ? (
              <div className="border-t border-[#dce8e9] px-3 py-2">
                <button type="button" onClick={onOpenDetail} className="mb-2 flex w-full items-center justify-between rounded-md border border-[#cfe2df] bg-[#f1faf8] px-3 py-2 text-left text-xs font-bold text-[#08766e]"><span>ดูรายละเอียด item</span><span>Lots · ledger · info</span></button>
                <div className="grid gap-2">
                  {item.lots.map((lot) => (
                    <button key={lot.id} type="button" onClick={() => onLotAction({ item, lot })} className="rounded-md border border-[#e1eaeb] bg-white px-3 py-2 text-left">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="mono block truncate text-sm font-bold text-[#173d50]">{lot.lotNumber}</span>
                          <span className="mt-0.5 block text-xs text-[#789097]">EXP {formatDate(lot.expiryDate)}</span>
                        </span>
                        <ExpiryBadge state={lot.expiryState} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="mono font-bold text-[#315763]">{formatQuantity(lot.totalOnHand)} {item.unit}</span>
                        <span className="text-xs font-semibold text-[#0b7f76]">Actions</span>
                      </div>
                    </button>
                  ))}
                  {!item.lots.length ? <p className="rounded-md border border-dashed border-[#d5e2e3] px-3 py-5 text-center text-sm text-[#91a4a9]">ยังไม่มี Lot รับเข้า</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
      {!items.length ? <p className="px-4 py-14 text-center text-sm text-[#91a4a9]">ไม่พบรายการ</p> : null}
    </div>
  )
}

function StockDetail({ actor, item, transactions, locations, onReverse, onLotAction }: { actor: BmActor; item: StockItem | null; transactions: StockTransaction[]; locations: StockWorkspace['locations']; onReverse: (tx: StockTransaction) => void; onLotAction: (value: { item: StockItem; lot: StockLot }) => void }) {
  const ledgerPagination = usePagination(transactions.length, 15)
  const [tab, setTab] = useState<'lots' | 'movements' | 'info'>('lots')
  if (!item) return <div className="flex min-h-[520px] items-center justify-center p-8 text-center"><div><PackageSearch className="mx-auto size-10 text-[#b6c6c9]" /><p className="mt-3 text-sm text-[#82979d]">ยังไม่มีสินค้า / No items</p></div></div>
  const pagedTransactions = transactions.slice(ledgerPagination.start, ledgerPagination.end)
  return <div className="min-w-0 bg-[#fcfefe]">
    <div className="border-b border-[#e0e9ea] bg-[linear-gradient(115deg,#fafdfe,#eaf8f5)] px-5 py-5">
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
    <div className="flex gap-1 border-b border-[#e0e9ea] px-4 pt-3" role="tablist" aria-label="รายละเอียดสินค้า">
      {([['lots', 'Lots & balances'], ['movements', 'Movement ledger'], ['info', 'Item info']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`border-b-2 px-3 py-2 text-sm font-bold transition ${tab === key ? 'border-[#0b7f76] text-[#0b7f76]' : 'border-transparent text-[#789097] hover:text-[#315763]'}`}>{label}</button>)}
    </div>
    {tab === 'lots' ? <section className="px-4 py-4">
      <div className="flex items-center justify-between"><h3 className="font-bold text-[#173d50]">Lots / Location balances</h3><PackageCheck className="size-5 text-[#0b7f76]" /></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {item.lots.map((lot) => <LotCard key={lot.id} lot={lot} item={item} locations={locations} onLotAction={() => onLotAction({ item, lot })} />)}
        {!item.lots.length ? <p className="col-span-full rounded-md border border-dashed border-[#d5e2e3] px-3 py-7 text-center text-sm text-[#91a4a9]">ยังไม่มี Lot รับเข้า</p> : null}
      </div>
    </section> : null}
    {tab === 'movements' ? <section>
      <div className="flex items-center gap-2 border-b border-[#edf2f2] px-4 py-3"><History className="size-4 text-[#0b7f76]" /><h3 className="font-bold text-[#173d50]">Movement ledger</h3></div>
      <div>
        {pagedTransactions.map((transaction) => <TransactionRow key={transaction.id} actor={actor} transaction={transaction} onReverse={() => onReverse(transaction)} />)}
        {!transactions.length ? <p className="px-4 py-8 text-center text-sm text-[#91a4a9]">ยังไม่มี transaction</p> : null}
      </div>
      {transactions.length > 15 ? <Pagination {...ledgerPagination} total={transactions.length} onChange={ledgerPagination.setPage} /> : null}
    </section> : null}
    {tab === 'info' ? <section className="grid gap-3 p-4 sm:grid-cols-2">
      <InfoLine label="Category" value={item.categoryName} /><InfoLine label="Supplier" value={item.supplier ?? '-'} /><InfoLine label="Catalog no." value={item.catalogNo ?? '-'} /><InfoLine label="Manufacturer" value={item.manufacturer ?? '-'} /><InfoLine label="Storage" value={item.storageCondition ?? '-'} /><InfoLine label="Tracking" value={`${item.trackLot ? 'Lot' : 'No lot'} · ${item.trackExpiry ? 'Expiry' : 'No expiry'}`} />
    </section> : null}
  </div>
}

function MobileItemDetailDrawer({ actor, item, transactions, locations, onReverse, onLotAction, onClose }: { actor: BmActor; item: StockItem; transactions: StockTransaction[]; locations: StockWorkspace['locations']; onReverse: (transaction: StockTransaction) => void; onLotAction: (value: { item: StockItem; lot: StockLot }) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 bg-[#08242b]/45 p-2 xl:hidden" onClick={onClose}><div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#cadcda] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b border-[#e0e9ea] bg-[#f7fcfb] px-4 py-3"><div><p className="text-[10px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Item detail</p><p className="mono mt-0.5 text-xs font-bold text-[#315763]">{item.itemCode}</p></div><button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-lg text-[#58747d] hover:bg-[#eaf5f3]" aria-label="ปิดรายละเอียด"><X className="size-5" /></button></div><div className="min-h-0 flex-1 overflow-y-auto"><StockDetail actor={actor} item={item} transactions={transactions} locations={locations} onReverse={onReverse} onLotAction={onLotAction} /></div></div></div>
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-[#e1ebeb] bg-white px-3 py-3"><p className="text-[10px] font-bold tracking-[0.12em] text-[#8ba0a5] uppercase">{label}</p><p className="mt-1 text-sm font-semibold text-[#315763]">{value}</p></div>
}

function LotCard({ lot, item, locations, onLotAction }: { lot: StockLot; item: StockItem; locations: StockWorkspace['locations']; onLotAction: () => void }) {
  const color = lot.expiryState === 'expired' ? 'border-[#efc7cc] bg-[#fff8f8]' : lot.expiryState === 'expiring' ? 'border-[#eed4a6] bg-[#fffdf7]' : 'border-[#d8e6e6] bg-white'
  return <div className={`rounded-md border p-3 ${color}`}>
    <div className="flex items-start justify-between gap-2"><div><p className="mono text-xs font-bold text-[#315763]">{lot.lotNumber}</p><p className="mt-1 text-[11px] text-[#8b9da2]">EXP {formatDate(lot.expiryDate)}</p></div><ExpiryBadge state={lot.expiryState} /></div>
    <p className="mono mt-3 text-lg font-bold text-[#173d50]">{formatQuantity(lot.totalOnHand)} <span className="text-[11px] font-semibold text-[#789097]">{item.unit}</span></p>
    <div className="mt-2 space-y-1">{lot.balances.map((balance) => <p key={balance.locationId} className="flex justify-between text-[11px] text-[#6f868b]"><span>{balance.locationCode}</span><span className="mono">{formatQuantity(balance.onHand)}</span></p>)}</div>
    <div className="mt-2 flex flex-wrap gap-1">
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onLotAction}><MoveRight className="size-3" /> Actions</Button>
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => printLotLabel(lot, item, locations.find((location) => location.id === lot.balances[0]?.locationId))}><Printer className="size-3" /> Label</Button>
    </div>
  </div>
}

function LotActionSheet({ item, lot, locations, onClose }: { item: StockItem; lot: StockLot; locations: StockWorkspace['locations']; onClose: () => void }) {
  const firstLocationId = lot.balances[0]?.locationId
  const firstLocation = locations.find((location) => location.id === firstLocationId)
  const issueHref = `/movements?mode=issue&lotId=${lot.id}${firstLocationId ? `&locationId=${firstLocationId}` : ''}`
  const moveHref = `/movements?mode=move&lotId=${lot.id}${firstLocationId ? `&locationId=${firstLocationId}` : ''}`
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[#08242b]/35 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] xl:hidden" onClick={onClose}>
      <div className="w-full rounded-lg border border-[#d6e2e3] bg-white shadow-[0_-18px_40px_rgba(20,64,72,0.18)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[#e0e9ea] px-4 py-3">
          <div className="min-w-0">
            <p className="mono text-xs font-bold text-[#0b7f76]">{item.itemCode}</p>
            <h2 className="mt-0.5 truncate font-bold text-[#173d50]">{lot.lotNumber}</h2>
            <p className="mt-0.5 text-xs text-[#789097]">EXP {formatDate(lot.expiryDate)} · {formatQuantity(lot.totalOnHand)} {item.unit}</p>
          </div>
          <button type="button" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-md text-[#789097] hover:bg-[#eef5f4]"><X className="size-5" /></button>
        </div>
        <div className="grid gap-2 p-3">
          <Button className="h-12 w-full" onClick={() => { window.location.href = issueHref }}><ArrowUpFromLine className="size-4" /> ตัด stock / Issue</Button>
          <Button variant="secondary" className="h-12 w-full" onClick={() => { window.location.href = moveHref }}><MoveRight className="size-4" /> ย้ายที่ / Move</Button>
          <Button variant="secondary" className="h-12 w-full" onClick={() => { window.location.href = `/movements?mode=receive&itemId=${item.id}` }}><ArrowDownToLine className="size-4" /> รับเพิ่ม / Receive more</Button>
          <Button variant="ghost" className="h-11 w-full" onClick={() => printLotLabel(lot, item, firstLocation)}><Printer className="size-4" /> Print label</Button>
        </div>
      </div>
    </div>
  )
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

