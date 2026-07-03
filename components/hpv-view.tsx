'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpFromLine,
  Boxes,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Hospital,
  PackageMinus,
  Plus,
  QrCode,
  ScanLine,
  Send,
  X,
} from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { HpvBoxType, HpvStorageBox, HpvWorkspace } from '@/lib/hpv/types'
import { formatHpvBoxPosition, HPV_BOX_CAPACITY } from '@/lib/hpv/rules'
import { formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea } from '@/components/ui'

type Tab = 'distribution' | 'receipts' | 'storage' | 'checkout'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function boxTypeLabel(type: HpvBoxType) {
  return type === 'self_collected' ? 'Self-collected' : 'Clinician-collected'
}

function normalizeScan(value: string) {
  return value.trim()
}

function useCameraScanner(onScan: (code: string) => void, onError: (message: string) => void) {
  const [cameraOn, setCameraOn] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const lastRef = useRef({ code: '', at: 0 })

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return
    let stopped = false
    let controls: { stop: () => void } | undefined
    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
          const code = normalizeScan(result?.getText() ?? '')
          if (!code || stopped) return
          const now = Date.now()
          if (code === lastRef.current.code && now - lastRef.current.at < 1500) return
          lastRef.current = { code, at: now }
          onScan(code)
        })
      } catch (error) {
        onError(error instanceof Error ? error.message : 'เปิดกล้องไม่ได้')
        setCameraOn(false)
      }
    }
    start()
    return () => {
      stopped = true
      controls?.stop()
    }
  }, [cameraOn, onError, onScan])

  return { cameraOn, setCameraOn, videoRef }
}

export function HpvView({ actor, initialData }: { actor: BmActor; initialData: HpvWorkspace }) {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<Tab>('distribution')
  const [today] = useState(todayKey)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null>(null)

  function onWorkspace(workspace: HpvWorkspace, text: string) {
    setData(workspace)
    setNotice({ tone: 'success', text })
  }

  const storedSamples = data.boxes.flatMap((box) => box.samples).filter((sample) => sample.status === 'stored').length
  const dueBoxes = data.boxes.filter((box) => box.destroyDueAt && box.destroyDueAt.slice(0, 10) <= today).length
  const openBoxes = data.boxes.filter((box) => box.status === 'open').length
  const totalOutstanding = data.summaries.reduce((sum, summary) => sum + summary.outstanding, 0)

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        eyebrow="HPV Management"
        title="HPV Management"
        description="เบิก-จ่ายชุดเก็บตัวอย่าง รพ.สต. และจัดเก็บ sample storage box 5x5"
        actions={<Tabs tabs={[
          { key: 'distribution', label: 'เบิก-จ่าย', icon: PackageMinus },
          { key: 'receipts', label: 'Receive Log', icon: ClipboardCheck },
          { key: 'storage', label: 'Sample Storage', icon: Boxes },
          { key: 'checkout', label: 'Checkout', icon: Send },
        ]} active={tab} onChange={setTab} />}
      />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active sites" value={data.sites.filter((site) => site.isActive).length} hint="รพ.สต./หน่วยงาน" />
        <StatCard label="Outstanding kits" value={totalOutstanding} tone={totalOutstanding > 0 ? 'warning' : 'accepted'} hint="เบิกแล้วเทียบส่งกลับ" />
        <StatCard label="Stored samples" value={storedSamples} hint="รอ checkout / ทำลาย" />
        <StatCard label="Storage alerts" value={dueBoxes} tone={dueBoxes > 0 ? 'rejected' : 'neutral'} hint={`${openBoxes} open box`} />
      </div>

      {tab === 'distribution' ? <DistributionTab actor={actor} data={data} onWorkspace={onWorkspace} onNotice={setNotice} /> : null}
      {tab === 'receipts' ? <ReceiptsTab data={data} onWorkspace={onWorkspace} onNotice={setNotice} /> : null}
      {tab === 'storage' ? <StorageTab data={data} today={today} onWorkspace={onWorkspace} onNotice={setNotice} /> : null}
      {tab === 'checkout' ? <CheckoutTab data={data} onWorkspace={onWorkspace} onNotice={setNotice} /> : null}
    </div>
  )
}

function DistributionTab({
  actor,
  data,
  onWorkspace,
  onNotice,
}: {
  actor: BmActor
  data: HpvWorkspace
  onWorkspace: (workspace: HpvWorkspace, text: string) => void
  onNotice: (notice: { tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null) => void
}) {
  const activeSites = data.sites.filter((site) => site.isActive)
  const stockLines = useMemo(() => data.stock.items.filter((item) => item.isHpv).flatMap((item) =>
    item.lots.flatMap((lot) => lot.balances.filter((balance) => balance.onHand > 0).map((balance) => ({
      key: `${lot.id}:${balance.locationId}`,
      item,
      lot,
      balance,
    }))),
  ), [data.stock.items])
  const [form, setForm] = useState({
    siteId: activeSites[0]?.id ?? '',
    distributedOn: todayKey(),
    stockKey: stockLines[0]?.key ?? '',
    quantity: '1',
    note: '',
    overrideReason: '',
  })
  const [siteForm, setSiteForm] = useState({ code: '', name: '', siteType: 'รพ.สต.' })
  const [busy, setBusy] = useState(false)
  const selectedSiteId = form.siteId || activeSites[0]?.id || ''
  const selectedStockKey = stockLines.some((line) => line.key === form.stockKey) ? form.stockKey : stockLines[0]?.key ?? ''
  const selectedStock = stockLines.find((line) => line.key === selectedStockKey)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedStock) return
    setBusy(true)
    onNotice(null)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/distributions', {
        method: 'POST',
        body: JSON.stringify({
          siteId: selectedSiteId,
          distributedOn: form.distributedOn,
          lotId: selectedStock.lot.id,
          locationId: selectedStock.balance.locationId,
          quantity: Number(form.quantity),
          note: form.note.trim() || null,
          overrideReason: form.overrideReason.trim() || null,
        }),
      })
      onWorkspace(result.workspace, 'บันทึกเบิกชุด HPV และหัก Stock กลางแล้ว')
      setForm((current) => ({ ...current, quantity: '1', note: '', overrideReason: '' }))
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกเบิกไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function createSite(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/sites', { method: 'POST', body: JSON.stringify(siteForm) })
      onWorkspace(result.workspace, 'เพิ่มหน่วยงานแล้ว')
      setSiteForm({ code: '', name: '', siteType: 'รพ.สต.' })
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เพิ่มหน่วยงานไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function toggleSite(siteId: string, isActive: boolean) {
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/sites', { method: 'PATCH', body: JSON.stringify({ id: siteId, isActive: !isActive }) })
      onWorkspace(result.workspace, 'อัปเดตสถานะหน่วยงานแล้ว')
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อัปเดตหน่วยงานไม่สำเร็จ' })
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-[#173d50]"><Hospital className="size-4 text-[#0b7f76]" /> Site balances</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase">
              <tr><th className="px-4 py-2.5">หน่วยงาน</th><th className="px-3 py-2.5 text-right">เบิก</th><th className="px-3 py-2.5 text-right">ส่งกลับ</th><th className="px-3 py-2.5 text-right">คงค้าง</th><th className="px-4 py-2.5">สถานะ</th></tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f2]">
              {data.sites.map((site) => {
                const summary = data.summaries.find((item) => item.siteId === site.id)
                return (
                  <tr key={site.id}>
                    <td className="px-4 py-3"><p className="font-bold text-[#315763]">{site.name}</p><p className="mono text-xs text-[#91a3a7]">{site.code ?? '-'} · {site.siteType}</p></td>
                    <td className="mono px-3 py-3 text-right font-bold">{summary?.issued ?? 0}</td>
                    <td className="mono px-3 py-3 text-right font-bold text-[#0b7f76]">{summary?.received ?? 0}</td>
                    <td className={`mono px-3 py-3 text-right font-bold ${(summary?.outstanding ?? 0) > 0 ? 'text-[#a9700f]' : 'text-[#55727c]'}`}>{summary?.outstanding ?? 0}</td>
                    <td className="px-4 py-3">
                      {actor.role === 'Admin'
                        ? <button onClick={() => toggleSite(site.id, site.isActive)} className={`rounded border px-2 py-1 text-[10px] font-bold ${site.isActive ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{site.isActive ? 'ACTIVE' : 'INACTIVE'}</button>
                        : <StatusBadge tone={site.isActive ? 'accepted' : 'neutral'} label={site.isActive ? 'ACTIVE' : 'INACTIVE'} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!data.sites.length ? <p className="px-4 py-12 text-center text-sm text-[#91a4a9]">ยังไม่มีหน่วยงาน</p> : null}
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-3">
            <h2 className="font-bold text-[#173d50]">บันทึกเบิกชุด HPV</h2>
            <Field label="หน่วยงาน / รพ.สต."><Select required value={selectedSiteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>{activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></Field>
            <Field label="วันที่เบิก"><Input required type="date" value={form.distributedOn} onChange={(e) => setForm({ ...form, distributedOn: e.target.value })} /></Field>
            <Field label="Stock lot / location"><Select required value={selectedStockKey} onChange={(e) => setForm({ ...form, stockKey: e.target.value })}>{stockLines.map((line) => <option key={line.key} value={line.key}>{line.item.itemCode} · {line.item.name} · LOT {line.lot.lotNumber} · {line.balance.locationCode} ({formatQuantity(line.balance.onHand)} {line.item.unit})</option>)}</Select></Field>
            <Field label="จำนวนชุด"><Input required type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="FEFO override reason"><Input value={form.overrideReason} onChange={(e) => setForm({ ...form, overrideReason: e.target.value })} placeholder="กรอกเมื่อระบบแจ้งว่าไม่ใช่ lot/location ที่แนะนำ" /></Field>
            <Field label="Note"><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <Button disabled={busy || !selectedSiteId || !selectedStock}><ArrowUpFromLine className="size-4" /> บันทึกเบิกและหัก Stock</Button>
          </form>
        </Card>
        {actor.role === 'Admin' ? (
          <Card className="p-4">
            <form onSubmit={createSite} className="space-y-3">
              <h2 className="font-bold text-[#173d50]">เพิ่ม รพ.สต./หน่วยงาน</h2>
              <div className="grid gap-2 sm:grid-cols-[120px_1fr]"><Field label="Code"><Input value={siteForm.code} onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} /></Field><Field label="Name"><Input required value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></Field></div>
              <Field label="Type"><Select value={siteForm.siteType} onChange={(e) => setSiteForm({ ...siteForm, siteType: e.target.value })}><option>รพ.สต.</option><option>รพช.</option><option>คลินิก</option></Select></Field>
              <Button disabled={busy}><Plus className="size-4" /> เพิ่มหน่วยงาน</Button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function ReceiptsTab({ data, onWorkspace, onNotice }: {
  data: HpvWorkspace
  onWorkspace: (workspace: HpvWorkspace, text: string) => void
  onNotice: (notice: { tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null) => void
}) {
  const activeSites = data.sites.filter((site) => site.isActive)
  const [form, setForm] = useState({ siteId: activeSites[0]?.id ?? '', receivedOn: todayKey(), sampleCount: '1', note: '' })
  const [busy, setBusy] = useState(false)
  const selectedSiteId = form.siteId || activeSites[0]?.id || ''

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/receipts', {
        method: 'POST',
        body: JSON.stringify({ siteId: selectedSiteId, receivedOn: form.receivedOn, sampleCount: Number(form.sampleCount), note: form.note.trim() || null }),
      })
      onWorkspace(result.workspace, 'บันทึก Receive Log แล้ว')
      setForm((current) => ({ ...current, sampleCount: '1', note: '' }))
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกรับตัวอย่างไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-4">
        <form onSubmit={submit} className="space-y-3">
          <h2 className="font-bold text-[#173d50]">บันทึกตัวอย่างส่งกลับ</h2>
          <Field label="หน่วยงาน"><Select required value={selectedSiteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>{activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></Field>
          <Field label="วันที่ส่ง"><Input required type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} /></Field>
          <Field label="จำนวนตัวอย่าง"><Input required type="number" min="1" step="1" value={form.sampleCount} onChange={(e) => setForm({ ...form, sampleCount: e.target.value })} /></Field>
          <Field label="Note"><Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <Button disabled={busy || !selectedSiteId}><ClipboardCheck className="size-4" /> Save receive log</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3 font-bold text-[#173d50]">Recent receive logs</div>
        <div className="divide-y divide-[#edf2f2]">
          {data.receipts.map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div><p className="font-bold text-[#315763]">{receipt.siteName}</p><p className="text-xs text-[#8ba0a5]">{formatDate(receipt.receivedOn)} · {receipt.createdByName ?? '-'}</p>{receipt.note ? <p className="mt-1 text-xs text-[#6f868b]">{receipt.note}</p> : null}</div>
            <p className="mono text-lg font-bold text-[#0b7f76]">{receipt.sampleCount}</p>
          </div>)}
          {!data.receipts.length ? <p className="px-4 py-12 text-center text-sm text-[#91a4a9]">ยังไม่มี Receive Log</p> : null}
        </div>
      </Card>
    </div>
  )
}

function StorageTab({ data, today, onWorkspace, onNotice }: {
  data: HpvWorkspace
  today: string
  onWorkspace: (workspace: HpvWorkspace, text: string) => void
  onNotice: (notice: { tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null) => void
}) {
  const openBoxes = data.boxes.filter((box) => box.status === 'open')
  const [selectedBoxId, setSelectedBoxId] = useState(openBoxes[0]?.id ?? data.boxes[0]?.id ?? '')
  const [barcode, setBarcode] = useState('')
  const [busy, setBusy] = useState(false)
  const [boxForm, setBoxForm] = useState({ boxCode: `HPV-${todayKey().replaceAll('-', '')}-01`, boxType: 'self_collected' as HpvBoxType })
  const effectiveBoxId = data.boxes.some((box) => box.id === selectedBoxId) ? selectedBoxId : openBoxes[0]?.id ?? data.boxes[0]?.id ?? ''
  const selectedBox = data.boxes.find((box) => box.id === effectiveBoxId) ?? data.boxes[0] ?? null

  async function scan(codeInput = barcode) {
    const code = normalizeScan(codeInput)
    if (!code || !selectedBox) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/storage/scan', { method: 'POST', body: JSON.stringify({ barcode: code, boxId: selectedBox.id }) })
      onWorkspace(result.workspace, `จัดเก็บ sample ${code} แล้ว`)
      setBarcode('')
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'จัดเก็บ sample ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  const { cameraOn, setCameraOn, videoRef } = useCameraScanner((code) => { void scan(code) }, (text) => onNotice({ tone: 'danger', text }))

  async function createBox(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/storage/boxes', { method: 'POST', body: JSON.stringify(boxForm) })
      onWorkspace(result.workspace, 'เปิด storage box ใหม่แล้ว')
      const nextSuffix = String(data.boxes.length + 2).padStart(2, '0')
      setBoxForm((current) => ({ ...current, boxCode: `HPV-${todayKey().replaceAll('-', '')}-${nextSuffix}` }))
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เปิดกล่องไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className="p-4">
          <form onSubmit={createBox} className="space-y-3">
            <h2 className="font-bold text-[#173d50]">เปิด Storage box</h2>
            <Field label="Box code"><Input required value={boxForm.boxCode} onChange={(e) => setBoxForm({ ...boxForm, boxCode: e.target.value })} /></Field>
            <Field label="Box type"><Select value={boxForm.boxType} onChange={(e) => setBoxForm({ ...boxForm, boxType: e.target.value as HpvBoxType })}><option value="self_collected">Self-collected Box</option><option value="clinician_collected">Clinician-collected Box</option></Select></Field>
            <Button disabled={busy}><Plus className="size-4" /> Open box</Button>
          </form>
        </Card>
        <Card className="p-4">
          <form onSubmit={(e) => { e.preventDefault(); void scan() }} className="space-y-3">
            <h2 className="font-bold text-[#173d50]">ยิงบาร์โค้ดเข้า box</h2>
            <Field label="Active box"><Select value={effectiveBoxId} onChange={(e) => setSelectedBoxId(e.target.value)}>{data.boxes.map((box) => <option key={box.id} value={box.id}>{box.boxCode} · {boxTypeLabel(box.boxType)} · {box.status}</option>)}</Select></Field>
            <div className="relative"><ScanLine className="absolute top-3 left-3 size-5 text-[#88a1a7]" /><Input autoFocus value={barcode} onChange={(e) => setBarcode(e.target.value)} className="h-12 pl-11 mono text-base" placeholder="Sample barcode" /></div>
            <div className="flex gap-2"><Button disabled={busy || !selectedBox || selectedBox.status !== 'open'}><QrCode className="size-4" /> Store sample</Button><Button type="button" variant="secondary" onClick={() => setCameraOn((value) => !value)}>{cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} Camera</Button></div>
            {cameraOn ? <div className="overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" /></div> : null}
          </form>
        </Card>
      </div>
      <BoxPanel box={selectedBox} today={today} />
    </div>
  )
}

function BoxPanel({ box, today }: { box: HpvStorageBox | null; today: string }) {
  if (!box) return <Card className="flex min-h-[520px] items-center justify-center p-8 text-center text-sm text-[#789097]">ยังไม่มี Storage box</Card>
  const sampleMap = new Map(box.samples.map((sample) => [sample.position, sample]))
  const occupied = box.samples.length
  const dueTone = box.destroyDueAt && box.destroyDueAt.slice(0, 10) <= today ? 'rejected' : 'warning'
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eaeb] bg-[linear-gradient(115deg,#fafdfe,#eef9f7)] px-4 py-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">{boxTypeLabel(box.boxType)}</p>
          <h2 className="mt-1 text-xl font-bold text-[#173d50]">{box.boxCode}</h2>
          <p className="mt-1 text-xs text-[#789097]">{occupied}/{HPV_BOX_CAPACITY} positions · created {formatDateTime(box.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={box.status === 'open' ? 'accepted' : box.status === 'full' ? 'warning' : 'neutral'} label={box.status.toUpperCase()} />
          {box.destroyDueAt ? <StatusBadge tone={dueTone} label={`Destroy due ${formatDate(box.destroyDueAt)}`} /> : null}
        </div>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: HPV_BOX_CAPACITY }, (_, index) => {
            const position = index + 1
            const sample = sampleMap.get(position)
            const checkedOut = sample?.status === 'checked_out'
            return (
              <div key={position} className={`aspect-square rounded-md border p-2 ${sample ? checkedOut ? 'border-[#d2dee0] bg-[#f6f9f9]' : 'border-[#97d5cf] bg-[#eef9f7]' : 'border-dashed border-[#d7e3e5] bg-white'}`}>
                <p className="mono text-[10px] font-bold text-[#789097]">{formatHpvBoxPosition(position)}</p>
                {sample ? <p className={`mono mt-2 truncate text-xs font-bold ${checkedOut ? 'text-[#6f868b]' : 'text-[#0b7f76]'}`}>{sample.barcode}</p> : <p className="mt-2 text-xs text-[#b4c3c6]">empty</p>}
              </div>
            )
          })}
        </div>
        <div className="max-h-[520px] overflow-y-auto rounded-md border border-[#e1eaeb]">
          {box.samples.map((sample) => <div key={sample.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2f2] px-3 py-2 last:border-0">
            <div><p className="mono font-bold text-[#315763]">{sample.barcode}</p><p className="text-xs text-[#8ba0a5]">{formatHpvBoxPosition(sample.position)} · stored {formatDateTime(sample.storedAt)} · {sample.storedByName ?? '-'}</p></div>
            <StatusBadge tone={sample.status === 'stored' ? 'accepted' : 'neutral'} label={sample.status} />
          </div>)}
          {!box.samples.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">ยังไม่มีตัวอย่างในกล่องนี้</p> : null}
        </div>
      </div>
    </Card>
  )
}

function CheckoutTab({ data, onWorkspace, onNotice }: {
  data: HpvWorkspace
  onWorkspace: (workspace: HpvWorkspace, text: string) => void
  onNotice: (notice: { tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null) => void
}) {
  const [barcode, setBarcode] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const storedSamples = data.boxes.flatMap((box) => box.samples.map((sample) => ({ ...sample, box }))).filter((sample) => sample.status === 'stored')

  async function checkout(codeInput = barcode) {
    const code = normalizeScan(codeInput)
    if (!code) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/storage/checkout', { method: 'POST', body: JSON.stringify({ barcode: code, note: note.trim() || null }) })
      onWorkspace(result.workspace, `Checkout ${code} ไป Co-testing แล้ว`)
      setBarcode('')
      setNote('')
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Checkout ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  const { cameraOn, setCameraOn, videoRef } = useCameraScanner((code) => { void checkout(code) }, (text) => onNotice({ tone: 'danger', text }))

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); void checkout() }} className="space-y-3">
          <h2 className="font-bold text-[#173d50]">Checkout to Co-testing</h2>
          <div className="relative"><ScanLine className="absolute top-3 left-3 size-5 text-[#88a1a7]" /><Input autoFocus value={barcode} onChange={(e) => setBarcode(e.target.value)} className="h-12 pl-11 mono text-base" placeholder="Sample barcode" /></div>
          <Field label="Note"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex gap-2"><Button disabled={busy || !barcode.trim()}><CheckCircle2 className="size-4" /> Checkout</Button><Button type="button" variant="secondary" onClick={() => setCameraOn((value) => !value)}>{cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} Camera</Button></div>
          {cameraOn ? <div className="overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" /></div> : null}
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3 font-bold text-[#173d50]">Stored samples ready for checkout</div>
        <div className="divide-y divide-[#edf2f2]">
          {storedSamples.map((sample) => <button key={sample.id} onClick={() => setBarcode(sample.barcode)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-[#f6fbfa]">
            <div><p className="mono font-bold text-[#315763]">{sample.barcode}</p><p className="text-xs text-[#8ba0a5]">{sample.box.boxCode} · {formatHpvBoxPosition(sample.position)} · {boxTypeLabel(sample.box.boxType)}</p></div>
            <Send className="size-4 text-[#0b7f76]" />
          </button>)}
          {!storedSamples.length ? <p className="px-4 py-12 text-center text-sm text-[#91a4a9]">ไม่มีตัวอย่างที่รอ checkout</p> : null}
        </div>
      </Card>
    </div>
  )
}
