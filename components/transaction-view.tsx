'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  CheckCircle2,
  Download,
  Hash,
  History,
  MapPin,
  MoveRight,
  PackageSearch,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import type { BmActor, StockItem, StockLot, StockTransaction, StockWorkspace } from '@/lib/bm/types'
import { formatDate, formatDateTime, formatQuantity, suggestedUsableLot } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui'

type Mode = 'receive' | 'issue' | 'move' | 'adjust' | 'history'
const LAST_RECEIVE_LOCATION_KEY = 'bm-stock:last-receive-location-id'

const ALL_TABS: { mode: Mode; label: string; icon: typeof ArrowDownToLine; adminOnly?: boolean }[] = [
  { mode: 'receive', label: 'รับเข้า', icon: ArrowDownToLine },
  { mode: 'issue', label: 'ตัด Stock', icon: ArrowUpFromLine },
  { mode: 'move', label: 'ย้ายที่', icon: MoveRight },
  { mode: 'adjust', label: 'ปรับยอด', icon: SlidersHorizontal, adminOnly: true },
  { mode: 'history', label: 'History', icon: History },
]

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

function firstAvailableReceiveLocation(locations: StockWorkspace['locations'], defaultLocationId?: string) {
  if (defaultLocationId && locations.some((location) => location.id === defaultLocationId)) {
    return defaultLocationId
  }
  return locations[0]?.id ?? ''
}

function readLastReceiveLocation(locations: StockWorkspace['locations'], defaultLocationId?: string) {
  const fallback = firstAvailableReceiveLocation(locations, defaultLocationId)
  if (typeof window === 'undefined') return fallback
  try {
    const savedLocationId = window.localStorage.getItem(LAST_RECEIVE_LOCATION_KEY)
    return savedLocationId && locations.some((location) => location.id === savedLocationId) ? savedLocationId : fallback
  } catch {
    return fallback
  }
}

function rememberReceiveLocation(locationId: string) {
  if (!locationId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_RECEIVE_LOCATION_KEY, locationId)
  } catch {
    // Some browsers block storage in private mode; receiving should still work.
  }
}

export function TransactionView({
  actor,
  initialMode,
  initialData,
  defaultItemId,
  defaultLotId,
  defaultLocationId,
}: {
  actor?: BmActor
  initialMode: Mode
  initialData: StockWorkspace
  defaultItemId?: string
  defaultLotId?: string
  defaultLocationId?: string
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [data, setData] = useState(initialData)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const activeItems = data.items.filter((item) => item.isActive)
  const activeLocations = data.locations.filter((location) => location.isActive)
  const visibleTabs = ALL_TABS.filter((tab) => !tab.adminOnly || actor?.role === 'Admin')
  const title =
    mode === 'receive' ? 'รับเข้า / Receive'
    : mode === 'issue' ? 'ตัด Stock / Issue'
    : mode === 'adjust' ? 'ปรับยอด / Adjust stock'
    : mode === 'history' ? 'Movement History'
    : 'ย้ายที่เก็บ / Move'
  const description =
    mode === 'receive' ? 'รับน้ำยาเข้าคลังด้วยหน้าจอมือถือ เลือก item, location, lot และจำนวน'
    : mode === 'issue' ? 'ตัด stock จาก lot และ location ที่มีของคงเหลือ จะระบุ purpose หรือเว้นว่างก็ได้'
    : mode === 'adjust' ? 'ปรับยอด stock โดยตรง (สำหรับ Admin) เช่น นับ physical ไม่ตรงระบบ หรือของเสีย'
    : mode === 'history' ? `${data.transactions.length} transactions — กรองและ export CSV ได้`
    : 'ย้ายยอดคงเหลือระหว่าง location'

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28 sm:pb-5">
      <PageHeader eyebrow="Stock movement" title={title} description={description} />
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[#d6e2e3] bg-white p-1" role="tablist" aria-label="ประเภทการเคลื่อนไหว stock">
        {visibleTabs.map(({ mode: tabMode, label, icon: Icon }) => {
          const active = mode === tabMode
          return (
            <button
              key={tabMode}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setMode(tabMode)
                setNotice(null)
              }}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${active ? 'bg-[#0b7f76] text-white' : 'text-[#58747d] hover:bg-[#eef6f5]'}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          )
        })}
      </div>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {mode === 'receive' ? (
        <ReceiveForm
          items={activeItems}
          locations={activeLocations}
          defaultItemId={defaultItemId}
          defaultLocationId={defaultLocationId}
          onSaved={(stock) => {
            setData(stock)
            setNotice({ tone: 'success', text: 'บันทึกรับเข้าแล้ว / Receive saved' })
          }}
          onError={(text) => setNotice({ tone: 'danger', text })}
        />
      ) : null}
      {mode === 'issue' ? (
        <IssueForm
          items={activeItems}
          defaultLotId={defaultLotId}
          defaultLocationId={defaultLocationId}
          onSaved={(stock) => {
            setData(stock)
            setNotice({ tone: 'success', text: 'ตัด stock แล้ว / Issue saved' })
          }}
          onError={(text) => setNotice({ tone: 'danger', text })}
        />
      ) : null}
      {mode === 'move' ? (
        <MoveForm
          items={activeItems}
          locations={activeLocations}
          defaultLotId={defaultLotId}
          defaultLocationId={defaultLocationId}
          onSaved={(stock) => {
            setData(stock)
            setNotice({ tone: 'success', text: 'บันทึกย้ายที่เก็บแล้ว / Move saved' })
          }}
          onError={(text) => setNotice({ tone: 'danger', text })}
        />
      ) : null}
      {mode === 'adjust' ? (
        <AdjustForm
          items={activeItems}
          locations={activeLocations}
          onSaved={(stock) => {
            setData(stock)
            setNotice({ tone: 'success', text: 'ปรับยอดแล้ว / Adjustment saved' })
          }}
          onError={(text) => setNotice({ tone: 'danger', text })}
        />
      ) : null}
      {mode === 'history' ? (
        <HistoryTab
          transactions={data.transactions}
          actor={actor}
          onSaved={(stock) => {
            setData(stock)
            setNotice({ tone: 'success', text: 'Reverse transaction แล้ว' })
          }}
          onError={(text) => setNotice({ tone: 'danger', text })}
        />
      ) : null}
    </div>
  )
}

function ReceiveForm({
  items,
  locations,
  defaultItemId,
  defaultLocationId,
  onSaved,
  onError,
}: {
  items: StockItem[]
  locations: StockWorkspace['locations']
  defaultItemId?: string
  defaultLocationId?: string
  onSaved: (stock: StockWorkspace) => void
  onError: (text: string) => void
}) {
  const [form, setForm] = useState({
    itemId: items.some((item) => item.id === defaultItemId) ? defaultItemId! : items[0]?.id ?? '',
    locationId: firstAvailableReceiveLocation(locations, defaultLocationId),
    lotNumber: '',
    expiryDate: '',
    quantity: '',
    supplier: '',
    manufacturerBarcode: '',
    reference: '',
    note: '',
  })
  const [itemSearch, setItemSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const locationIdsKey = locations.map((candidate) => candidate.id).join('|')
  const item = items.find((candidate) => candidate.id === form.itemId)
  const location = locations.find((candidate) => candidate.id === form.locationId)
  const filteredItems = filterItems(items, itemSearch)
  const canSave = Boolean(item && location && form.quantity && (!item.trackLot || form.lotNumber.trim()) && (!item.trackExpiry || form.expiryDate))

  useEffect(() => {
    const savedLocationId = readLastReceiveLocation(locations, defaultLocationId)
    if (!savedLocationId) return
    setForm((current) => current.locationId === savedLocationId ? current : { ...current, locationId: savedLocationId })
  }, [defaultLocationId, locationIdsKey, locations])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave || !item) return
    setBusy(true)
    try {
      const result = await api<{ stock: StockWorkspace }>('/api/stock/receipts', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          lotNumber: item.trackLot ? form.lotNumber : null,
          expiryDate: item.trackExpiry ? form.expiryDate : null,
        }),
      })
      rememberReceiveLocation(form.locationId)
      onSaved(result.stock)
      setForm({ ...form, lotNumber: '', expiryDate: '', quantity: '', supplier: '', manufacturerBarcode: '', reference: '', note: '' })
      setItemSearch('')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึกรับเข้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!items.length || !locations.length) {
    return <Notice tone="warning">ต้องมี item และ location ก่อนรับเข้า stock / Add item and location first.</Notice>
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <MobilePanel>
        <PanelTitle icon={<ScanLine />} title="1. เลือกสินค้า / Select item" detail="สแกนหรือค้นด้วย item code, ชื่อ, catalog, barcode" />
        <ScanSearch
          value={itemSearch}
          onChange={setItemSearch}
          placeholder="Scan / search item"
          onPickFirst={() => {
            const first = filteredItems[0]
            if (first) {
              setForm({ ...form, itemId: first.id, lotNumber: '', expiryDate: '' })
              setItemSearch('')
            }
          }}
        />
        <div className="mt-3 max-h-[400px] overflow-y-auto grid gap-2 sm:grid-cols-2">
          {filteredItems.map((option) => (
            <ChoiceButton
              key={option.id}
              selected={option.id === form.itemId}
              title={`${option.itemCode} · ${option.name}`}
              meta={`${option.categoryName} · ${option.unit}${option.catalogNo ? ` · ${option.catalogNo}` : ''}`}
              onClick={() => setForm({ ...form, itemId: option.id, lotNumber: '', expiryDate: '' })}
            />
          ))}
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<MapPin />} title="2. Location" detail={location ? `${location.code} · ${location.name}` : 'เลือกที่เก็บ'} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {locations.map((option) => (
            <ChoiceButton
              key={option.id}
              selected={option.id === form.locationId}
              title={option.code}
              meta={option.name}
              compact
              onClick={() => {
                rememberReceiveLocation(option.id)
                setForm({ ...form, locationId: option.id })
              }}
            />
          ))}
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<Hash />} title="3. Lot และจำนวน / Lot and quantity" detail={item ? `${item.itemCode} · ${item.unit}` : 'เลือก item ก่อน'} />
        <div className="grid gap-3 sm:grid-cols-2">
          <BigField label="Lot number">
            <Input
              required={item?.trackLot}
              disabled={!item?.trackLot}
              className="h-12 text-base"
              value={item?.trackLot ? form.lotNumber : 'NO-LOT'}
              onChange={(event) => setForm({ ...form, lotNumber: event.target.value })}
            />
          </BigField>
          <BigField label="Expiry date">
            <Input
              required={item?.trackExpiry}
              disabled={!item?.trackExpiry}
              type={item?.trackExpiry ? 'date' : 'text'}
              className="h-12 text-base"
              value={item?.trackExpiry ? form.expiryDate : 'Not tracked'}
              onChange={(event) => setForm({ ...form, expiryDate: event.target.value })}
            />
          </BigField>
          <BigField label={`Quantity${item ? ` (${item.unit})` : ''}`}>
            <Input
              required
              inputMode="decimal"
              type="number"
              min="0.001"
              step="0.001"
              className="h-14 mono text-xl font-bold"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
            />
          </BigField>
          <BigField label="Manufacturer barcode">
            <Input
              className="h-12 mono text-base"
              value={form.manufacturerBarcode}
              onChange={(event) => setForm({ ...form, manufacturerBarcode: event.target.value })}
              placeholder="Scan barcode"
            />
          </BigField>
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<PackageSearch />} title="4. รายละเอียดเพิ่ม / Details" detail="ไม่บังคับ" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier"><Input className="h-11" value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} /></Field>
          <Field label="Reference"><Input className="h-11" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Note"><Textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field></div>
        </div>
      </MobilePanel>

      <MobileActionBar>
        <SummaryLine label="Receive" value={item ? `${item.itemCode} · ${form.quantity || '0'} ${item.unit}` : 'No item'} />
        <Button disabled={busy || !canSave} className="h-12 min-w-32"><ArrowDownToLine className="size-4" /> Save</Button>
      </MobileActionBar>
    </form>
  )
}

function IssueForm({
  items,
  defaultLotId,
  defaultLocationId,
  onSaved,
  onError,
}: {
  items: StockItem[]
  defaultLotId?: string
  defaultLocationId?: string
  onSaved: (stock: StockWorkspace) => void
  onError: (text: string) => void
}) {
  const stockedItems = items.filter((item) => item.lots.some((lot) => lot.balances.some((balance) => balance.onHand > 0)))
  const firstItem = stockedItems[0]
  const firstLot = stockedItems.flatMap((item) => item.lots).find((lot) => lot.id === defaultLotId) ?? suggestedUsableLot(firstItem?.lots ?? []) ?? firstItem?.lots.find((lot) => lot.totalOnHand > 0)
  const firstQtyItem = stockedItems.find((item) => item.id === firstLot?.itemId) ?? firstItem
  const [form, setForm] = useState({
    itemId: firstLot?.itemId ?? firstItem?.id ?? '',
    lotId: firstLot?.id ?? '',
    locationId: defaultLocationId ?? firstLot?.balances[0]?.locationId ?? '',
    quantity: firstQtyItem?.defaultIssueQty != null ? String(firstQtyItem.defaultIssueQty) : '',
    purpose: '',
    reference: '',
    note: '',
    overrideReason: '',
  })
  const [itemSearch, setItemSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const item = stockedItems.find((candidate) => candidate.id === form.itemId)
  const filteredItems = filterItems(stockedItems, itemSearch)
  const lots = item?.lots.filter((lot) => lot.balances.some((balance) => balance.onHand > 0)) ?? []
  const lot = lots.find((candidate) => candidate.id === form.lotId)
  const balances = lot?.balances.filter((balance) => balance.onHand > 0) ?? []
  const balance = balances.find((candidate) => candidate.locationId === form.locationId)
  const canSave = Boolean(lot && balance && form.quantity)

  function selectItem(nextItem: StockItem) {
    const nextLot = suggestedUsableLot(nextItem.lots) ?? nextItem.lots.find((candidate) => candidate.totalOnHand > 0)
    setForm({
      ...form,
      itemId: nextItem.id,
      lotId: nextLot?.id ?? '',
      locationId: nextLot?.balances[0]?.locationId ?? '',
      quantity: nextItem.defaultIssueQty != null ? String(nextItem.defaultIssueQty) : '',
      overrideReason: '',
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!lot || !balance || !canSave) return
    if (lot.expiryState === 'expired' && !window.confirm(`Lot ${lot.lotNumber} หมดอายุแล้ว ยืนยันการตัด stock?`)) return
    setBusy(true)
    try {
      const result = await api<{ stock: StockWorkspace }>('/api/stock/issues', {
        method: 'POST',
        body: JSON.stringify({ ...form, purpose: form.purpose.trim() || null, quantity: Number(form.quantity), expiredConfirmed: lot.expiryState === 'expired' }),
      })
      onSaved(result.stock)
      setForm({ ...form, quantity: '', purpose: '', reference: '', note: '', overrideReason: '' })
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ตัด stock ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!stockedItems.length) {
    return <Notice tone="warning">ยังไม่มี stock สำหรับตัดออก / No stock on hand.</Notice>
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <MobilePanel>
        <PanelTitle icon={<ScanLine />} title="1. เลือกสินค้า / Select item" detail="สแกนหรือค้น item ที่ต้องการตัด stock" />
        <ScanSearch
          value={itemSearch}
          onChange={setItemSearch}
          placeholder="Scan / search item"
          onPickFirst={() => {
            const first = filteredItems[0]
            if (first) {
              selectItem(first)
              setItemSearch('')
            }
          }}
        />
        <div className="mt-3 max-h-[400px] overflow-y-auto grid gap-2 sm:grid-cols-2">
          {filteredItems.map((option) => (
            <ChoiceButton
              key={option.id}
              selected={option.id === form.itemId}
              title={`${option.itemCode} · ${option.name}`}
              meta={`${formatQuantity(option.totalOnHand)} ${option.unit} on hand`}
              onClick={() => selectItem(option)}
            />
          ))}
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<CalendarDays />} title="2. เลือก Lot / Select lot" detail="เรียงตาม FEFO ในข้อมูลเดิม" />
        <div className="grid gap-2">
          {lots.map((option) => (
            <LotChoice key={option.id} lot={option} unit={item?.unit ?? ''} selected={option.id === form.lotId} onClick={() => setForm({ ...form, lotId: option.id, locationId: option.balances[0]?.locationId ?? '', overrideReason: '' })} />
          ))}
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<MapPin />} title="3. Location" detail={balance ? `${balance.locationCode} · ${formatQuantity(balance.onHand)} ${item?.unit}` : 'เลือก location'} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {balances.map((option) => (
            <ChoiceButton
              key={option.locationId}
              selected={option.locationId === form.locationId}
              title={option.locationCode}
              meta={`${formatQuantity(option.onHand)} ${item?.unit ?? ''}`}
              compact
              onClick={() => setForm({ ...form, locationId: option.locationId })}
            />
          ))}
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<ArrowUpFromLine />} title="4. จำนวนและเหตุผล / Quantity and purpose" detail={balance ? `สูงสุด ${formatQuantity(balance.onHand)} ${item?.unit} · purpose ไม่บังคับ` : 'เลือก lot/location ก่อน'} />
        <div className="grid gap-3 sm:grid-cols-2">
          <BigField label={`Quantity${item ? ` (${item.unit})` : ''}`}>
            <Input
              required
              inputMode="decimal"
              type="number"
              min="0.001"
              max={balance?.onHand}
              step="0.001"
              className="h-14 mono text-xl font-bold"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
            />
          </BigField>
          <BigField label="Purpose (optional)">
            <Input className="h-14 text-base" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="เว้นว่างได้ เช่น NIPT run, QC, validation" />
          </BigField>
          <Field label="Reference"><Input className="h-11" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field>
          <Field label="FEFO override reason"><Input className="h-11" value={form.overrideReason} onChange={(event) => setForm({ ...form, overrideReason: event.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Note"><Textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field></div>
        </div>
        {lot?.expiryState === 'expired' ? <div className="mt-3"><Notice tone="danger">Lot นี้หมดอายุแล้ว / Expired lot</Notice></div> : null}
      </MobilePanel>

      <MobileActionBar>
        <SummaryLine label="Issue" value={item ? `${item.itemCode} · ${form.quantity || '0'} ${item.unit}` : 'No item'} />
        <Button disabled={busy || !canSave} className="h-12 min-w-32"><ArrowUpFromLine className="size-4" /> Save</Button>
      </MobileActionBar>
    </form>
  )
}

function MoveForm({
  items,
  locations,
  defaultLotId,
  defaultLocationId,
  onSaved,
  onError,
}: {
  items: StockItem[]
  locations: StockWorkspace['locations']
  defaultLotId?: string
  defaultLocationId?: string
  onSaved: (stock: StockWorkspace) => void
  onError: (text: string) => void
}) {
  const stockedItems = items.filter((item) => item.lots.some((lot) => lot.balances.some((balance) => balance.onHand > 0)))
  const firstLot = stockedItems.flatMap((item) => item.lots).find((lot) => lot.id === defaultLotId) ?? stockedItems[0]?.lots.find((lot) => lot.totalOnHand > 0)
  const [form, setForm] = useState({ itemId: firstLot?.itemId ?? stockedItems[0]?.id ?? '', lotId: firstLot?.id ?? '', fromLocationId: defaultLocationId ?? firstLot?.balances[0]?.locationId ?? '', toLocationId: '', quantity: '', reference: '', note: '' })
  const [busy, setBusy] = useState(false)
  const item = stockedItems.find((candidate) => candidate.id === form.itemId)
  const lots = item?.lots.filter((lot) => lot.balances.some((balance) => balance.onHand > 0)) ?? []
  const lot = lots.find((candidate) => candidate.id === form.lotId)
  const fromBalances = lot?.balances.filter((balance) => balance.onHand > 0) ?? []
  const fromBalance = fromBalances.find((candidate) => candidate.locationId === form.fromLocationId)
  const destinationOptions = locations.filter((location) => location.id !== form.fromLocationId)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ stock: StockWorkspace }>('/api/stock/moves', { method: 'POST', body: JSON.stringify({ ...form, quantity: Number(form.quantity) }) })
      onSaved(result.stock)
      setForm({ ...form, quantity: '', reference: '', note: '' })
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึกย้ายที่เก็บไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <Field label="สินค้า / Item"><Select required value={form.itemId} onChange={(event) => { const next = stockedItems.find((candidate) => candidate.id === event.target.value); const nextLot = next?.lots.find((candidate) => candidate.totalOnHand > 0); setForm({ ...form, itemId: event.target.value, lotId: nextLot?.id ?? '', fromLocationId: nextLot?.balances[0]?.locationId ?? '', toLocationId: '' }) }}>{stockedItems.map((option) => <option key={option.id} value={option.id}>{option.itemCode} · {option.name}</option>)}</Select></Field>
        <Field label="Lot"><Select required value={form.lotId} onChange={(event) => { const nextLot = lots.find((candidate) => candidate.id === event.target.value); setForm({ ...form, lotId: event.target.value, fromLocationId: nextLot?.balances[0]?.locationId ?? '', toLocationId: '' }) }}>{lots.map((option) => <option key={option.id} value={option.id}>{option.lotNumber} · {formatQuantity(option.totalOnHand)} {item?.unit}</option>)}</Select></Field>
        <Field label="จาก / From"><Select required value={form.fromLocationId} onChange={(event) => setForm({ ...form, fromLocationId: event.target.value })}>{fromBalances.map((option) => <option key={option.locationId} value={option.locationId}>{option.locationCode} · {formatQuantity(option.onHand)} {item?.unit}</option>)}</Select></Field>
        <Field label="ไป / To"><Select required value={form.toLocationId} onChange={(event) => setForm({ ...form, toLocationId: event.target.value })}><option value="">เลือก destination</option>{destinationOptions.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}</Select></Field>
        <Field label={`จำนวน / Quantity${item ? ` (${item.unit})` : ''}`}><Input required type="number" min="0.001" max={fromBalance?.onHand} step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field>
        <Field label="Reference"><Input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field>
        <div className="lg:col-span-2"><Field label="หมายเหตุ / Note"><Textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field></div>
        <div className="lg:col-span-2"><Button disabled={busy || !stockedItems.length}><Save className="size-4" /> บันทึก / Save</Button></div>
      </form>
    </Card>
  )
}

function HistoryTab({
  transactions,
  actor,
  onSaved,
  onError,
}: {
  transactions: StockTransaction[]
  actor?: BmActor
  onSaved: (stock: StockWorkspace) => void
  onError: (text: string) => void
}) {
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return transactions.filter((tx) => {
      const typeOk = typeFilter === 'all' || tx.transactionType === typeFilter
      const textOk = !term || tx.lines.some((line) =>
        `${line.itemCode} ${line.itemName} ${line.lotNumber} ${tx.purpose ?? ''} ${tx.reference ?? ''}`.toLowerCase().includes(term),
      )
      return typeOk && textOk
    })
  }, [transactions, q, typeFilter])

  function exportCsv() {
    const rows = [
      ['Date', 'Type', 'Item', 'Lot', 'Location', 'Qty', 'Purpose', 'Reference', 'Note', 'By'],
      ...transactions.flatMap((tx) =>
        tx.lines.map((line) => [
          formatDateTime(tx.createdAt),
          tx.transactionType,
          `${line.itemCode} · ${line.itemName}`,
          line.lotNumber,
          line.locationCode,
          String(line.quantity),
          tx.purpose ?? '',
          tx.reference ?? '',
          tx.note ?? '',
          tx.createdByName ?? '',
        ]),
      ),
    ]
    downloadCsv(`movements_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  async function reverse(tx: StockTransaction) {
    const reason = window.prompt(`Reverse ${tx.transactionType}?\nกรอกเหตุผล:`)
    if (!reason?.trim()) return
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/stock/transactions/${tx.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      onSaved(result.stock)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Reverse ไม่สำเร็จ')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="ค้น item, lot, purpose, reference" />
        </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="receive">Receive</option>
          <option value="issue">Issue</option>
          <option value="move">Move</option>
          <option value="adjustment">Adjustment</option>
          <option value="reversal">Reversal</option>
        </Select>
        <Button variant="secondary" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button>
        <span className="text-xs text-[#789097]">{visible.length} / {transactions.length}</span>
      </div>
      <Card className="overflow-hidden">
        <div className="max-h-[640px] overflow-y-auto divide-y divide-[#edf2f2]">
          {visible.map((tx) => <HistoryRow key={tx.id} transaction={tx} actor={actor} onReverse={() => void reverse(tx)} />)}
          {!visible.length ? <p className="px-4 py-14 text-center text-sm text-[#91a4a9]">ไม่มีรายการ</p> : null}
        </div>
      </Card>
    </div>
  )
}

function HistoryRow({ transaction, actor, onReverse }: { transaction: StockTransaction; actor?: BmActor; onReverse: () => void }) {
  const first = transaction.lines[0]
  const badgeStyles: Record<StockTransaction['transactionType'], string> = {
    receive: 'bg-[#eef8f5] text-[#0b7f76]',
    issue: 'bg-[#fff1f2] text-[#b33b46]',
    move: 'bg-[#eef3ff] text-[#4568a3]',
    adjustment: 'bg-[#fff8e8] text-[#a76511]',
    reversal: 'bg-[#f2f5f5] text-[#6d8085]',
  }
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${badgeStyles[transaction.transactionType]}`}>{transaction.transactionType}</span>
            <span className="mono text-xs font-bold text-[#55727c]">{first?.lotNumber ?? '-'}</span>
            {transaction.reversedByTransactionId ? <span className="rounded bg-[#f2f5f5] px-1.5 py-0.5 text-[9px] font-bold text-[#87999e]">REVERSED</span> : null}
          </div>
          <p className="mt-1 text-[11px] text-[#91a3a7]">{formatDateTime(transaction.createdAt)} · {transaction.createdByName ?? '-'}</p>
          {first ? <p className="mt-0.5 text-xs font-semibold text-[#55727c]">{first.itemCode} · {first.itemName}</p> : null}
        </div>
        <div className="text-right">
          {transaction.lines.map((line, index) => (
            <p key={index} className={`mono text-sm font-bold ${line.quantity > 0 ? 'text-[#0b7f76]' : 'text-[#be3d49]'}`}>
              {line.quantity > 0 ? '+' : ''}{formatQuantity(line.quantity)} {line.unit} · {line.locationCode}
            </p>
          ))}
          {actor?.role === 'Admin' && transaction.canReverse
            ? <button onClick={onReverse} className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#789097] hover:text-[#be3d49]"><RotateCcw className="size-3" /> Reverse</button>
            : null}
        </div>
      </div>
      {transaction.purpose || transaction.reference || transaction.note
        ? <p className="mt-2 text-[11px] leading-5 text-[#7f9398]">{[transaction.purpose && `Purpose: ${transaction.purpose}`, transaction.reference && `Ref: ${transaction.reference}`, transaction.note].filter(Boolean).join(' · ')}</p>
        : null}
    </div>
  )
}

function AdjustForm({
  items,
  locations,
  onSaved,
  onError,
}: {
  items: StockItem[]
  locations: StockWorkspace['locations']
  onSaved: (stock: StockWorkspace) => void
  onError: (text: string) => void
}) {
  const lottedItems = items.filter((item) => item.lots.length > 0)
  const firstItem = lottedItems[0]
  const [form, setForm] = useState({
    itemId: firstItem?.id ?? '',
    lotId: firstItem?.lots[0]?.id ?? '',
    locationId: locations[0]?.id ?? '',
    quantity: '',
    reference: '',
    note: '',
  })
  const [itemSearch, setItemSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const item = lottedItems.find((i) => i.id === form.itemId)
  const lots = item?.lots ?? []
  const lot = lots.find((l) => l.id === form.lotId)
  const currentBalance = lot?.balances.find((b) => b.locationId === form.locationId)?.onHand ?? 0
  const qty = Number(form.quantity)
  const hasValidQuantity = form.quantity.trim() !== '' && Number.isFinite(qty)
  const newBalance = currentBalance + (hasValidQuantity ? qty : 0)
  const filteredItems = filterItems(lottedItems, itemSearch)
  const canSave = Boolean(lot && form.locationId && hasValidQuantity && qty !== 0 && form.note.trim())

  function toggleAdjustmentSign() {
    const value = form.quantity.trim()
    if (!value) {
      setForm({ ...form, quantity: '-' })
      return
    }
    setForm({ ...form, quantity: value.startsWith('-') ? value.slice(1) : `-${value.replace(/^\+/, '')}` })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave) return
    if (newBalance < 0 && !window.confirm(`ยอดจะติดลบ (${formatQuantity(newBalance)} ${item?.unit ?? ''}) ยืนยันการปรับ?`)) return
    setBusy(true)
    try {
      const result = await api<{ stock: StockWorkspace }>('/api/stock/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          lotId: form.lotId,
          locationId: form.locationId,
          quantity: qty,
          reference: form.reference.trim() || null,
          note: form.note.trim(),
        }),
      })
      onSaved(result.stock)
      setForm({ ...form, quantity: '', reference: '', note: '' })
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ปรับยอดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!lottedItems.length) {
    return <Notice tone="warning">ยังไม่มี lot — รับเข้าก่อนจึงจะปรับยอดได้</Notice>
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <MobilePanel>
        <PanelTitle icon={<ScanLine />} title="1. เลือกสินค้า / Select item" detail="สแกนหรือค้น item ที่ต้องการปรับยอด" />
        <ScanSearch
          value={itemSearch}
          onChange={setItemSearch}
          placeholder="Scan / search item"
          onPickFirst={() => {
            const first = filteredItems[0]
            if (first) {
              setForm({ ...form, itemId: first.id, lotId: first.lots[0]?.id ?? '' })
              setItemSearch('')
            }
          }}
        />
        <div className="mt-3 max-h-[400px] overflow-y-auto grid gap-2 sm:grid-cols-2">
          {filteredItems.map((option) => (
            <ChoiceButton
              key={option.id}
              selected={option.id === form.itemId}
              title={`${option.itemCode} · ${option.name}`}
              meta={`${option.categoryName} · ${formatQuantity(option.totalOnHand)} ${option.unit} on hand`}
              onClick={() => setForm({ ...form, itemId: option.id, lotId: option.lots[0]?.id ?? '' })}
            />
          ))}
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<CalendarDays />} title="2. เลือก Lot / Select lot" detail="รวม lot ที่ยอดคงเหลือเป็น 0" />
        <div className="grid gap-2">
          {lots.map((option) => (
            <LotChoice
              key={option.id}
              lot={option}
              unit={item?.unit ?? ''}
              selected={option.id === form.lotId}
              onClick={() => setForm({ ...form, lotId: option.id })}
            />
          ))}
          {!lots.length ? (
            <p className="rounded-md border border-dashed border-[#d5e2e3] px-3 py-7 text-center text-sm text-[#91a4a9]">ไม่มี lot</p>
          ) : null}
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<MapPin />} title="3. Location และจำนวน / Location and quantity" detail={`ยอดปัจจุบัน: ${formatQuantity(currentBalance)} ${item?.unit ?? ''}`} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {locations.map((option) => {
                const bal = lot?.balances.find((b) => b.locationId === option.id)?.onHand ?? 0
                return (
                  <ChoiceButton
                    key={option.id}
                    selected={option.id === form.locationId}
                    title={option.code}
                    meta={`${formatQuantity(bal)} ${item?.unit ?? ''}`}
                    compact
                    onClick={() => setForm({ ...form, locationId: option.id })}
                  />
                )
              })}
            </div>
          </div>
          <BigField label={`Adjustment${item ? ` (${item.unit})` : ''}`}>
            <div className="flex h-14 overflow-hidden rounded-md border border-[#b7d2d0] bg-white focus-within:ring-2 focus-within:ring-[#0b7f76]">
              <button
                type="button"
                aria-label="Toggle positive or negative adjustment"
                title="Toggle +/-"
                onClick={toggleAdjustmentSign}
                className="flex w-14 shrink-0 items-center justify-center border-r border-[#d8e6e6] text-[#0b7f76] transition hover:bg-[#eef7f6] active:bg-[#d9eeec]"
              >
                <span className="mono text-base font-bold">+/-</span>
              </button>
              <Input
              required
              inputMode="decimal"
              type="text"
              className="h-full border-0 mono text-xl font-bold focus-visible:ring-0"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              placeholder="+10 หรือ -5"
              />
            </div>
          </BigField>
          <BigField label="ยอดใหม่ (preview)">
            <div
              className={`flex h-14 items-center rounded-md border px-3 font-mono text-xl font-bold ${
                newBalance < 0
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-[#d8e6e6] bg-[#f7fbfc] text-[#0b7f76]'
              }`}
            >
              {hasValidQuantity ? `${formatQuantity(newBalance)} ${item?.unit ?? ''}` : '—'}
            </div>
          </BigField>
        </div>
      </MobilePanel>

      <MobilePanel>
        <PanelTitle icon={<PackageSearch />} title="4. เหตุผล / Reason (จำเป็น)" detail="บันทึกสาเหตุที่ปรับยอด เช่น นับ stock ได้ต่างจากระบบ" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reference"><Input className="h-11" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Note (จำเป็น)">
              <Textarea
                required
                rows={3}
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="เช่น นับ physical ได้ 48 ชิ้น ระบบแสดง 50 / ของเสียระหว่างเก็บ 2 ชิ้น"
              />
            </Field>
          </div>
        </div>
      </MobilePanel>

      <MobileActionBar>
        <SummaryLine
          label="Adjustment"
          value={
            lot && form.quantity
              ? `${item?.itemCode} · ${qty > 0 ? '+' : ''}${form.quantity} ${item?.unit ?? ''}`
              : 'กรอกข้อมูลให้ครบ'
          }
        />
        <Button disabled={busy || !canSave} className="h-12 min-w-32">
          <SlidersHorizontal className="size-4" /> Adjust
        </Button>
      </MobileActionBar>
    </form>
  )
}

function MobilePanel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border border-[#d6e2e3] bg-white/95 p-3 shadow-[0_12px_34px_rgba(20,64,72,0.06)] sm:p-4">{children}</section>
}

function PanelTitle({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[#e8f7f5] text-[#0b7f76] [&>svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <h2 className="font-bold text-[#173d50]">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-[#789097]">{detail}</p>
      </div>
    </div>
  )
}

function ScanSearch({ value, onChange, onPickFirst, placeholder }: { value: string; onChange: (value: string) => void; onPickFirst: () => void; placeholder: string }) {
  return (
    <div className="relative">
      <ScanLine className="absolute top-3.5 left-3 size-5 text-[#88a1a7]" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onPickFirst()
          }
        }}
        className="h-12 pl-11 text-base"
        placeholder={placeholder}
      />
    </div>
  )
}

function ChoiceButton({
  selected,
  title,
  meta,
  onClick,
  compact = false,
}: {
  selected: boolean
  title: string
  meta: string
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition ${selected ? 'border-[#0b7f76] bg-[#eef9f7] shadow-[inset_0_0_0_1px_#0b7f76]' : 'border-[#d8e6e6] bg-white hover:border-[#9fc2c3]'}`}
    >
      <span className="min-w-0">
        <span className={`block font-bold text-[#173d50] ${compact ? 'text-sm' : 'text-sm sm:text-base'}`}>{title}</span>
        <span className="mt-0.5 block truncate text-xs text-[#789097]">{meta}</span>
      </span>
      {selected ? <CheckCircle2 className="size-5 shrink-0 text-[#0b7f76]" /> : null}
    </button>
  )
}

function LotChoice({ lot, unit, selected, onClick }: { lot: StockLot; unit: string; selected: boolean; onClick: () => void }) {
  const stateClass = lot.expiryState === 'expired' ? 'bg-[#fff1f2] text-[#b33b46]' : lot.expiryState === 'expiring' ? 'bg-[#fff8e8] text-[#a76511]' : 'bg-[#eef8f5] text-[#0b7f76]'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-3 text-left transition ${selected ? 'border-[#0b7f76] bg-[#eef9f7] shadow-[inset_0_0_0_1px_#0b7f76]' : 'border-[#d8e6e6] bg-white hover:border-[#9fc2c3]'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mono text-sm font-bold text-[#173d50]">{lot.lotNumber}</p>
          <p className="mt-1 text-xs text-[#789097]">EXP {formatDate(lot.expiryDate)}</p>
        </div>
        <span className={`rounded px-2 py-1 text-[10px] font-bold ${stateClass}`}>{lot.expiryState}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="mono text-lg font-bold text-[#173d50]">{formatQuantity(lot.totalOnHand)} <span className="text-xs text-[#789097]">{unit}</span></p>
        {selected ? <CheckCircle2 className="size-5 text-[#0b7f76]" /> : null}
      </div>
    </button>
  )
}

function BigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-[#58747d]">{label}</span>
      {children}
    </label>
  )
}

function MobileActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed right-0 bottom-0 left-0 z-30 border-t border-[#d6e2e3] bg-white/95 px-4 py-3 shadow-[0_-18px_40px_rgba(20,64,72,0.14)] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none sm:backdrop-blur-0">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">{children}</div>
    </div>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold tracking-[0.16em] text-[#789097] uppercase">{label}</p>
      <p className="truncate text-sm font-bold text-[#173d50]">{value}</p>
    </div>
  )
}

function filterItems(items: StockItem[], query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return items
  return items.filter((item) => [item.itemCode, item.name, item.categoryName, item.catalogNo, item.manufacturerBarcode].filter(Boolean).join(' ').toLowerCase().includes(term))
}
