'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpFromLine,
  Boxes,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileUp,
  Flame,
  Hospital,
  Loader2,
  PackageMinus,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ScanLine,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { HpvBoxType, HpvKitDistribution, HpvSample, HpvSiteReceipt, HpvSpecimenType, HpvStorageBox, HpvWorkspace } from '@/lib/hpv/types'
import { formatHpvBoxPosition, getHpvDestructionState, HPV_BOX_CAPACITY, specimenTypeLabel } from '@/lib/hpv/rules'
import { bangkokDateKey, daysUntil, formatDate, formatDateTime, formatQuantity } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea } from '@/components/ui'
import { Pagination, usePagination } from '@/components/pagination'

type Tab = 'distribution' | 'returns' | 'receipts' | 'storage' | 'checkout'

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function boxTypeLabel(type: HpvBoxType) {
  return type === 'self_collected' ? 'Self-collected' : 'Clinician-collected'
}

function SpecimenTypeBadge({ type, compact = false }: { type: HpvSpecimenType; compact?: boolean }) {
  const selfCollected = type === 'self_collected'
  return (
    <span className={`inline-flex rounded-full border font-bold ${compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[10px]'} ${selfCollected ? 'border-[#97d5cf] bg-[#e7f7f4] text-[#08766e]' : 'border-[#efd294] bg-[#fff7df] text-[#9a6700]'}`}>
      {compact ? (selfCollected ? 'SELF' : 'CLIN') : specimenTypeLabel(type)}
    </span>
  )
}

function normalizeScan(value: string) {
  return value.trim()
}

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
  const checkedOutTotal = data.boxes.flatMap((box) => box.samples).filter((s) => s.status === 'checked_out').length
  const dueBoxes = data.boxes.filter((box) => box.destroyDueAt && box.destroyDueAt.slice(0, 10) <= today).length
  const openBoxes = data.boxes.filter((box) => box.status === 'open').length
  const fullBoxes = data.boxes.filter((box) => box.status === 'full').length
  const destroyedBoxes = data.boxes.filter((box) => box.status === 'destroyed').length
  const totalOutstanding = data.summaries.filter((s) => !s.selfSupplied).reduce((sum, s) => sum + s.outstanding, 0)

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        eyebrow="HPV Management"
        title="HPV Management"
        description="เบิก-จ่ายชุดเก็บตัวอย่าง รพ.สต. และจัดเก็บ sample storage box 5x5"
        actions={<Tabs tabs={[
          { key: 'distribution', label: 'เบิก-จ่าย', icon: PackageMinus },
          { key: 'returns', label: 'คืนชุดตรวจ', icon: RotateCcw },
          { key: 'receipts', label: 'Receive Log', icon: ClipboardCheck },
          { key: 'storage', label: 'Sample Storage', icon: Boxes },
          { key: 'checkout', label: 'Checkout', icon: Send },
        ]} active={tab} onChange={setTab} />}
      />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active sites" value={data.sites.filter((site) => site.isActive).length} hint="รพ.สต./หน่วยงาน" />
        <StatCard label="Outstanding kits" value={totalOutstanding} tone={totalOutstanding > 0 ? 'warning' : 'accepted'} hint="เบิกแล้วเทียบส่งกลับ" />
        <StatCard label="Stored samples" value={storedSamples} hint={`${checkedOutTotal} checked out`} />
        <StatCard label="Destroy due" value={dueBoxes} tone={dueBoxes > 0 ? 'rejected' : 'neutral'} hint={`${openBoxes} open · ${fullBoxes} full · ${destroyedBoxes} destroyed`} />
      </div>

      {tab === 'distribution' ? <DistributionTab actor={actor} data={data} onWorkspace={onWorkspace} onNotice={setNotice} /> : null}
      {tab === 'returns' ? <ReturnsTab data={data} onWorkspace={onWorkspace} onNotice={setNotice} /> : null}
      {tab === 'receipts' ? <ReceiptsTab actor={actor} data={data} onWorkspace={onWorkspace} onNotice={setNotice} /> : null}
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
  const distributionSites = activeSites.filter((site) => !site.selfSupplied)
  const [kitType, setKitType] = useState<'self_collected' | 'clinician_collected' | ''>('')
  const stockItems = useMemo(() => data.stock.items.filter((item) =>
    item.isHpv
    && (kitType === 'self_collected' ? item.hpvSelfCollected : kitType === 'clinician_collected' ? item.hpvClinicianCollected : false)
    && item.isActive
  ).sort((a, b) => a.itemCode.localeCompare(b.itemCode)), [data.stock.items, kitType])
  const stockLinesByItem = useMemo(() => new Map(stockItems.map((item) => [
    item.id,
    item.lots.flatMap((lot) => lot.balances.filter((balance) => balance.onHand > 0).map((balance) => ({
      key: `${lot.id}:${balance.locationId}`,
      item,
      lot,
      balance,
    }))),
  ])), [stockItems])
  const [form, setForm] = useState({
    siteId: distributionSites[0]?.id ?? '',
    distributedOn: todayKey(),
    quantity: '1',
    note: '',
    overrideReason: '',
  })
  const [selectedLineKeys, setSelectedLineKeys] = useState<Record<string, string>>({})
  const [siteForm, setSiteForm] = useState({ code: '', name: '', siteType: 'รพ.สต.', selfSupplied: false })
  const [editingSite, setEditingSite] = useState<{ id: string; code: string; name: string; siteType: string; selfSupplied: boolean } | null>(null)
  const [distributionFile, setDistributionFile] = useState<File | null>(null)
  const distributionFileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const selectedSiteId = form.siteId || distributionSites[0]?.id || ''
  const selectedBundleLines = stockItems.map((item) => {
    const itemLines = stockLinesByItem.get(item.id) ?? []
    const selectedKey = itemLines.some((line) => line.key === selectedLineKeys[item.id]) ? selectedLineKeys[item.id] : itemLines[0]?.key ?? ''
    return { item, itemLines, selectedKey, selectedLine: itemLines.find((line) => line.key === selectedKey) ?? null }
  })
  const canSubmitBundle = Boolean(selectedSiteId && kitType && stockItems.length && selectedBundleLines.every((line) => line.selectedLine))
  const distributionsPagination = usePagination(data.distributions.length, 10)
  const pagedDistributions = data.distributions.slice(distributionsPagination.start, distributionsPagination.end)

  async function uploadDistributionFile(distributionId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('module', 'hpv')
    formData.append('entityType', 'hpv-distribution')
    formData.append('entityId', distributionId)
    formData.append('kind', 'distribution-document')
    const response = await fetch('/api/attachments', { method: 'POST', body: formData })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error ?? 'Upload attachment failed')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmitBundle) return
    setBusy(true)
    onNotice(null)
    try {
      const distributionLines = selectedBundleLines
        .map((line) => line.selectedLine)
        .filter((line): line is NonNullable<typeof line> => Boolean(line))
      const result = await api<{ workspace: HpvWorkspace; distributionId: string }>('/api/hpv/distributions', {
        method: 'POST',
        body: JSON.stringify({
          siteId: selectedSiteId,
          distributedOn: form.distributedOn,
          kitType,
          quantity: Number(form.quantity),
          lines: distributionLines.map((line) => ({
            lotId: line.lot.id,
            locationId: line.balance.locationId,
          })),
          note: form.note.trim() || null,
          overrideReason: form.overrideReason.trim() || null,
        }),
      })
      let attachmentError = ''
      if (distributionFile) {
        try {
          await uploadDistributionFile(result.distributionId, distributionFile)
        } catch (uploadError) {
          attachmentError = uploadError instanceof Error ? uploadError.message : 'Upload attachment failed'
        }
      }
      onWorkspace(result.workspace, 'บันทึกเบิกชุด HPV และหัก Stock กลางแล้ว')
      if (attachmentError) {
        onNotice({ tone: 'warning', text: `บันทึกเบิกแล้ว แต่แนบไฟล์ไม่สำเร็จ: ${attachmentError}` })
      } else {
        setDistributionFile(null)
        if (distributionFileRef.current) distributionFileRef.current.value = ''
      }
      setForm((current) => ({ ...current, quantity: '1', note: '', overrideReason: '' }))
      setSelectedLineKeys({})
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
      setSiteForm({ code: '', name: '', siteType: 'รพ.สต.', selfSupplied: false })
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เพิ่มหน่วยงานไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function saveSite(event: React.FormEvent) {
    event.preventDefault()
    if (!editingSite) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/sites', {
        method: 'PATCH',
        body: JSON.stringify({ id: editingSite.id, name: editingSite.name, code: editingSite.code.trim() || null, siteType: editingSite.siteType, selfSupplied: editingSite.selfSupplied }),
      })
      onWorkspace(result.workspace, 'อัปเดตหน่วยงานแล้ว')
      setEditingSite(null)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อัปเดตหน่วยงานไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function cancelDistribution(dist: HpvKitDistribution) {
    const reason = window.prompt(`ยืนยันยกเลิกการเบิก ${dist.quantity} ชุดให้ "${dist.siteName}"?\n\nระบุเหตุผล (จำเป็น):`)
    if (reason === null) return
    if (!reason.trim()) return onNotice({ tone: 'danger', text: 'กรุณาระบุเหตุผล' })
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/distributions/${dist.id}?reason=${encodeURIComponent(reason.trim())}`, { method: 'DELETE' })
      onWorkspace(result.workspace, `ยกเลิกการเบิกให้ ${dist.siteName} แล้ว Stock คืนแล้ว`)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  function exportDistributions() {
    const headers = ['วันที่', 'หน่วยงาน', 'หมวด', 'รายการในชุด', 'Lot', 'Location', 'จำนวนชุด', 'Note', 'บันทึกโดย']
    const rows = data.distributions.map((d) => [
      d.distributedOn,
      d.siteName,
      d.kitType ? boxTypeLabel(d.kitType) : '',
      d.lines.map((line) => [line.itemCode, line.itemName].filter(Boolean).join(' · ')).join('; '),
      d.lines.map((line) => line.lotNumber ?? '-').join('; '),
      d.lines.map((line) => line.locationCode ?? '-').join('; '),
      String(d.quantity),
      d.note ?? '',
      d.createdByName ?? '',
    ])
    downloadCsv(`HPV_distributions_${todayKey()}.csv`, [headers, ...rows])
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
    <div className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-[#173d50]"><Hospital className="size-4 text-[#0b7f76]" /> Site balances</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase">
              <tr><th className="px-4 py-2.5">หน่วยงาน</th><th className="px-3 py-2.5 text-right">เบิก</th><th className="px-3 py-2.5 text-right">ส่งกลับ</th><th className="px-3 py-2.5 text-right">คืนชุดตรวจ</th><th className="px-3 py-2.5 text-right">คงค้าง</th><th className="px-4 py-2.5">สถานะ</th></tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f2]">
              {data.sites.map((site) => {
                const summary = data.summaries.find((item) => item.siteId === site.id)
                return (
                  <tr key={site.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-[#315763]">{site.name}</p>
                        {site.selfSupplied ? <span className="rounded-full border border-[#a6c6e8] bg-[#eef4fb] px-2 py-0.5 text-[10px] font-bold text-[#3a6fa8]">ชุดตรวจตัวเอง</span> : null}
                      </div>
                      <p className="mono text-xs text-[#91a3a7]">{site.code ?? '-'} · {site.siteType}</p>
                    </td>
                    <td className="mono px-3 py-3 text-right font-bold">{site.selfSupplied ? '—' : (summary?.issued ?? 0)}</td>
                    <td className="mono px-3 py-3 text-right font-bold text-[#0b7f76]">{summary?.received ?? 0}</td>
                    <td className="mono px-3 py-3 text-right font-bold text-[#3a6fa8]">{summary?.returned ?? 0}</td>
                    <td className="mono px-3 py-3 text-right font-bold">
                      {site.selfSupplied
                        ? <span className="text-xs font-normal text-[#91a3a7]">N/A</span>
                        : <span className={(summary?.outstanding ?? 0) > 0 ? 'text-[#a9700f]' : 'text-[#55727c]'}>{summary?.outstanding ?? 0}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {actor.role === 'Admin' ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button onClick={() => toggleSite(site.id, site.isActive)} className={`rounded border px-2 py-1 text-[10px] font-bold ${site.isActive ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{site.isActive ? 'ACTIVE' : 'INACTIVE'}</button>
                          <span className={`rounded border px-2 py-1 text-[10px] font-bold ${site.selfSupplied ? 'border-[#a6c6e8] bg-[#eef4fb] text-[#3a6fa8]' : 'border-[#c7dde0] bg-[#f5f9fa] text-[#55727c]'}`}>{site.selfSupplied ? 'ชุดตรวจตัวเอง' : 'รับจากเรา'}</span>
                          <button onClick={() => setEditingSite({ id: site.id, code: site.code ?? '', name: site.name, siteType: site.siteType, selfSupplied: site.selfSupplied })} className="flex items-center gap-1 rounded border border-[#c7dde0] bg-[#f5f9fa] px-2 py-1 text-[10px] font-bold text-[#55727c] hover:bg-[#ebf5f6]"><Pencil className="size-3" /> แก้ไข</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone={site.isActive ? 'accepted' : 'neutral'} label={site.isActive ? 'ACTIVE' : 'INACTIVE'} />
                          {site.selfSupplied ? <StatusBadge tone="warning" label="ชุดตรวจตัวเอง" /> : null}
                        </div>
                      )}
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
            <Field label="หน่วยงาน / รพ.สต."><Select required value={selectedSiteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>{distributionSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></Field>
            {distributionSites.length === 0 ? <p className="text-xs text-[#789097]">ไม่มีหน่วยงานที่รับชุดตรวจจากเรา</p> : null}
            <Field label="วันที่เบิก"><Input required type="date" value={form.distributedOn} onChange={(e) => setForm({ ...form, distributedOn: e.target.value })} /></Field>
            <Field label="หมวดชุดตรวจ">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => { setKitType('self_collected'); setSelectedLineKeys({}) }}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-bold transition ${kitType === 'self_collected' ? 'border-[#0b7f76] bg-[#eef9f7] text-[#0b7f76]' : 'border-[#c9dadd] bg-white text-[#315763] hover:border-[#7fa9ad]'}`}
                >
                  Self-collected
                  {kitType === 'self_collected' ? <CheckCircle2 className="size-4" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => { setKitType('clinician_collected'); setSelectedLineKeys({}) }}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-bold transition ${kitType === 'clinician_collected' ? 'border-[#0b7f76] bg-[#eef9f7] text-[#0b7f76]' : 'border-[#c9dadd] bg-white text-[#315763] hover:border-[#7fa9ad]'}`}
                >
                  Clinician-collected
                  {kitType === 'clinician_collected' ? <CheckCircle2 className="size-4" /> : null}
                </button>
              </div>
            </Field>
            {kitType ? (
              <>
                <div className="space-y-2 rounded-md border border-[#d8e5e7] bg-[#fbfdfd] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold tracking-[0.08em] text-[#789097] uppercase">Stock bundle</p>
                    <span className="rounded-full bg-[#eef9f7] px-2 py-0.5 text-[10px] font-bold text-[#0b7f76]">{stockItems.length} item{stockItems.length === 1 ? '' : 's'}</span>
                  </div>
                  {selectedBundleLines.map(({ item, itemLines, selectedKey, selectedLine }) => (
                    <div key={item.id} className="rounded-md border border-[#e1eaeb] bg-white p-2">
                      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-[#315763]">{item.itemCode}</p>
                          <p className="text-xs text-[#789097]">{item.name}</p>
                        </div>
                        {selectedLine ? <span className="mono text-xs font-bold text-[#0b7f76]">ตัด {formatQuantity(Number(form.quantity) || 0)} {item.unit}</span> : <span className="text-xs font-bold text-[#a9700f]">ไม่มี stock</span>}
                      </div>
                      <Select
                        required
                        value={selectedKey}
                        disabled={!itemLines.length}
                        onChange={(e) => setSelectedLineKeys((current) => ({ ...current, [item.id]: e.target.value }))}
                      >
                        {itemLines.map((line) => (
                          <option key={line.key} value={line.key}>LOT {line.lot.lotNumber} · {line.balance.locationCode} ({formatQuantity(line.balance.onHand)} {item.unit})</option>
                        ))}
                        {!itemLines.length ? <option value="">ไม่มี lot ที่มียอดคงเหลือ</option> : null}
                      </Select>
                    </div>
                  ))}
                </div>
                {!stockItems.length ? <p className="text-xs text-[#a9700f]">ยังไม่มี Stock item ที่เชื่อมกับหมวดนี้</p> : null}
              </>
            ) : (
              <p className="rounded-md border border-dashed border-[#c9dadd] px-3 py-3 text-xs text-[#789097]">เลือกหมวดชุดตรวจก่อน แล้วระบบจะแสดง Stock และ Lot ที่เกี่ยวข้อง</p>
            )}
            <Field label="จำนวนชุด"><Input required type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="FEFO override reason"><Input value={form.overrideReason} onChange={(e) => setForm({ ...form, overrideReason: e.target.value })} placeholder="กรอกเมื่อระบบแจ้งว่าไม่ใช่ lot/location ที่แนะนำ" /></Field>
            <Field label="Note"><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <Field label="PDF / รูปประกอบ">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[#c9dadd] bg-white px-3 py-2 text-sm font-semibold text-[#315763] hover:border-[#7fa9ad]">
                <span className="flex min-w-0 items-center gap-2"><FileUp className="size-4 text-[#0b7f76]" /><span className="truncate">{distributionFile ? distributionFile.name : 'เลือกไฟล์ PDF/รูป'}</span></span>
                <span className="shrink-0 text-xs text-[#789097]">Optional</span>
                <input
                  ref={distributionFileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setDistributionFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {distributionFile ? <button type="button" onClick={() => { setDistributionFile(null); if (distributionFileRef.current) distributionFileRef.current.value = '' }} className="mt-1 text-xs font-bold text-[#789097] hover:text-[#c02a37]">ล้างไฟล์ที่เลือก</button> : null}
            </Field>
            <Button disabled={busy || !canSubmitBundle}><ArrowUpFromLine className="size-4" /> บันทึกเบิกและหัก Stock</Button>
          </form>
        </Card>
        {editingSite ? (
          <Card className="p-4 ring-1 ring-[#0b7f76]">
            <form onSubmit={saveSite} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-[#173d50]">แก้ไขหน่วยงาน</h2>
                <button type="button" onClick={() => setEditingSite(null)} className="text-[#8ba0a5] hover:text-[#315763]"><X className="size-4" /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[120px_1fr]"><Field label="Code"><Input value={editingSite.code} onChange={(e) => setEditingSite({ ...editingSite, code: e.target.value })} /></Field><Field label="Name"><Input required value={editingSite.name} onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })} /></Field></div>
              <Field label="Type"><Select value={editingSite.siteType} onChange={(e) => setEditingSite({ ...editingSite, siteType: e.target.value })}><option>รพ.สต.</option><option>รพช.</option><option>คลินิก</option></Select></Field>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={editingSite.selfSupplied} onChange={(e) => setEditingSite({ ...editingSite, selfSupplied: e.target.checked })} className="size-4 rounded" />
                <span className="font-medium text-[#315763]">ใช้ชุดตรวจของตัวเอง</span>
                <span className="text-xs text-[#789097]">(ไม่รับชุดตรวจจากเรา)</span>
              </label>
              <Button disabled={busy}><CheckCircle2 className="size-4" /> บันทึกแก้ไข</Button>
            </form>
          </Card>
        ) : null}
        {actor.role === 'Admin' ? (
          <Card className="p-4">
            <form onSubmit={createSite} className="space-y-3">
              <h2 className="font-bold text-[#173d50]">เพิ่ม รพ.สต./หน่วยงาน</h2>
              <div className="grid gap-2 sm:grid-cols-[120px_1fr]"><Field label="Code"><Input value={siteForm.code} onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} /></Field><Field label="Name"><Input required value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} /></Field></div>
              <Field label="Type"><Select value={siteForm.siteType} onChange={(e) => setSiteForm({ ...siteForm, siteType: e.target.value })}><option>รพ.สต.</option><option>รพช.</option><option>คลินิก</option></Select></Field>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={siteForm.selfSupplied} onChange={(e) => setSiteForm({ ...siteForm, selfSupplied: e.target.checked })} className="size-4 rounded" />
                <span className="font-medium text-[#315763]">ใช้ชุดตรวจของตัวเอง</span>
                <span className="text-xs text-[#789097]">(ไม่รับชุดตรวจจากเรา)</span>
              </label>
              <Button disabled={busy}><Plus className="size-4" /> เพิ่มหน่วยงาน</Button>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
        <h2 className="font-bold text-[#173d50]">ประวัติการเบิก</h2>
        <button onClick={exportDistributions} className="flex items-center gap-1.5 rounded border border-[#c7dde0] bg-[#f5f9fa] px-2.5 py-1.5 text-xs font-bold text-[#55727c] hover:bg-[#ebf5f6]"><Download className="size-3.5" /> Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="sticky top-0 bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase">
            <tr><th className="px-4 py-2.5">วันที่</th><th className="px-3 py-2.5">หน่วยงาน</th><th className="px-3 py-2.5">สินค้า · Lot</th><th className="px-3 py-2.5">Location</th><th className="px-3 py-2.5 text-right">จำนวน</th><th className="px-3 py-2.5">โดย</th><th className="px-3 py-2.5" /></tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f2]">
            {pagedDistributions.map((dist) => (
              <tr key={dist.id} className="hover:bg-[#f7fbfc]">
                <td className="mono px-4 py-2.5 text-[#315763]">{formatDate(dist.distributedOn)}</td>
                <td className="px-3 py-2.5 font-semibold text-[#315763]">{dist.siteName}</td>
                <td className="px-3 py-2.5 text-xs text-[#55727c]">
                  <div className="space-y-0.5">
                    {dist.lines.map((line, index) => (
                      <p key={`${line.stockLotId}:${line.stockLocationId}:${index}`}><span className="font-bold">{line.itemCode ?? '-'}</span> · LOT {line.lotNumber ?? '-'}</p>
                    ))}
                  </div>
                </td>
                <td className="mono px-3 py-2.5 text-xs text-[#789097]">{dist.lines.map((line) => line.locationCode ?? '-').join(', ')}</td>
                <td className="mono px-3 py-2.5 text-right font-bold text-[#315763]">{dist.quantity}</td>
                <td className="px-3 py-2.5 text-xs text-[#8ba0a5]">{dist.createdByName ?? '-'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <DistributionAttachmentActions distributionId={dist.id} canDelete={actor.role === 'Admin'} onError={(text) => onNotice({ tone: 'danger', text })} />
                    {actor.role === 'Admin' ? <button onClick={() => cancelDistribution(dist)} disabled={busy} className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-100 disabled:opacity-40"><X className="size-3" /> ยกเลิก</button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.distributions.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">ยังไม่มีประวัติการเบิก</p> : null}
      </div>
      {data.distributions.length > 10 ? <Pagination {...distributionsPagination} total={data.distributions.length} onChange={distributionsPagination.setPage} /> : null}
    </Card>
    </div>
  )
}

interface HpvAttachment {
  id: string
  fileName: string
}

function DistributionAttachmentActions({ distributionId, canDelete, onError }: { distributionId: string; canDelete: boolean; onError: (text: string) => void }) {
  const [attachments, setAttachments] = useState<HpvAttachment[] | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      const params = new URLSearchParams({ module: 'hpv', entityType: 'hpv-distribution', entityId: distributionId })
      const data = await api<{ attachments: HpvAttachment[] }>(`/api/attachments?${params}`)
      setAttachments(data.attachments)
    } catch {
      setAttachments([])
    }
  }

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ module: 'hpv', entityType: 'hpv-distribution', entityId: distributionId })
    api<{ attachments: HpvAttachment[] }>(`/api/attachments?${params}`)
      .then((data) => {
        if (active) setAttachments(data.attachments)
      })
      .catch(() => {
        if (active) setAttachments([])
      })
    return () => {
      active = false
    }
  }, [distributionId])

  async function upload(file: File) {
    setBusy(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('module', 'hpv')
      formData.append('entityType', 'hpv-distribution')
      formData.append('entityId', distributionId)
      formData.append('kind', 'distribution-document')
      const response = await fetch('/api/attachments', { method: 'POST', body: formData })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'Upload attachment failed')
      await refresh()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Upload attachment failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(attachment: HpvAttachment) {
    if (!window.confirm(`ลบเอกสารแนบ "${attachment.fileName}"?`)) return
    setBusy(true)
    try {
      await api(`/api/attachments/${attachment.id}`, { method: 'DELETE' })
      await refresh()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Delete attachment failed')
    } finally {
      setBusy(false)
    }
  }

  const firstAttachment = attachments?.[0]

  return (
    <span className="flex items-center gap-1">
      {firstAttachment ? (
        <a
          href={`/api/attachments/${firstAttachment.id}`}
          target="_blank"
          rel="noreferrer"
          title={firstAttachment.fileName}
          aria-label={`View ${firstAttachment.fileName}`}
          className="inline-flex size-7 items-center justify-center rounded border border-[#b9d7d8] bg-[#eef8f7] text-[#0b7f76] hover:bg-[#dff1ef]"
        >
          <Eye className="size-3.5" />
        </a>
      ) : null}
      {firstAttachment && canDelete ? (
        <button
          type="button"
          onClick={() => void remove(firstAttachment)}
          disabled={busy}
          title={`Delete ${firstAttachment.fileName}`}
          aria-label={`Delete ${firstAttachment.fileName}`}
          className="inline-flex size-7 items-center justify-center rounded border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
      <label className="inline-flex size-7 cursor-pointer items-center justify-center rounded border border-[#c9dadd] bg-white text-[#55727c] hover:bg-[#eef6f5]" title="Attach PDF/image">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      </label>
    </span>
  )
}

function ReturnsTab({ data, onWorkspace, onNotice }: {
  data: HpvWorkspace
  onWorkspace: (workspace: HpvWorkspace, text: string) => void
  onNotice: (notice: { tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null) => void
}) {
  const activeSites = data.sites.filter((site) => site.isActive)
  const [form, setForm] = useState({ siteId: activeSites[0]?.id ?? '', returnedOn: todayKey(), note: '' })
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const today = todayKey()

  const returnedByDistributionLine = useMemo(() => {
    const map = new Map<string, number>()
    for (const kitReturn of data.kitReturns) {
      for (const line of kitReturn.lines) {
        if (!line.distributionLineId) continue
        map.set(line.distributionLineId, (map.get(line.distributionLineId) ?? 0) + line.quantity)
      }
    }
    return map
  }, [data.kitReturns])

  const candidates = useMemo(() => data.distributions
    .filter((distribution) => distribution.siteId === form.siteId)
    .flatMap((distribution) => distribution.lines.map((line) => {
      const alreadyReturned = line.id ? (returnedByDistributionLine.get(line.id) ?? 0) : 0
      const remaining = line.quantity - alreadyReturned
      const daysToExpiry = line.expiryDate ? Math.ceil((Date.parse(line.expiryDate) - Date.parse(today)) / 86400000) : null
      return { distribution, line, alreadyReturned, remaining, daysToExpiry }
    }))
    .filter((item) => item.line.id && item.remaining > 0)
    .sort((a, b) => {
      const aExpiry = a.line.expiryDate ?? '9999-12-31'
      const bExpiry = b.line.expiryDate ?? '9999-12-31'
      return aExpiry.localeCompare(bExpiry) || a.distribution.distributedOn.localeCompare(b.distribution.distributedOn)
    }), [data.distributions, form.siteId, returnedByDistributionLine, today])

  const selectedLines = candidates
    .map((item) => ({ ...item, quantity: Number(quantities[item.line.id ?? ''] ?? 0) }))
    .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0)

  const returnsPagination = usePagination(data.kitReturns.length, 10)
  const pagedKitReturns = data.kitReturns.slice(returnsPagination.start, returnsPagination.end)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedLines.length) return
    const invalid = selectedLines.find((item) => item.quantity > item.remaining)
    if (invalid) {
      onNotice({ tone: 'danger', text: 'จำนวนคืนมากกว่ายอดที่ยังคืนได้' })
      return
    }
    setBusy(true)
    onNotice(null)
    try {
      const result = await api<{ workspace: HpvWorkspace; returnId: string }>('/api/hpv/returns', {
        method: 'POST',
        body: JSON.stringify({
          siteId: form.siteId,
          returnedOn: form.returnedOn,
          note: form.note.trim() || null,
          lines: selectedLines.map((item) => ({
            distributionId: item.distribution.id,
            distributionLineId: item.line.id,
            lotId: item.line.stockLotId,
            locationId: item.line.stockLocationId,
            quantity: item.quantity,
          })),
        }),
      })
      onWorkspace(result.workspace, 'บันทึกคืนชุดตรวจและคืนเข้า Stock เดิมแล้ว')
      setQuantities({})
      setForm((current) => ({ ...current, note: '' }))
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกคืนชุดตรวจไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold text-[#173d50]"><RotateCcw className="size-4 text-[#0b7f76]" /> คืนชุดตรวจจากหน่วยตรวจ</h2>
          <p className="mt-1 text-xs text-[#789097]">คืนกลับ lot และ location เดิม พร้อมปรับ balance ใน Stock อัตโนมัติ</p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="หน่วยตรวจ / Site">
              <Select value={form.siteId} onChange={(e) => { setForm((current) => ({ ...current, siteId: e.target.value })); setQuantities({}) }}>
                {activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </Select>
            </Field>
            <Field label="วันที่คืน">
              <Input type="date" value={form.returnedOn} onChange={(e) => setForm((current) => ({ ...current, returnedOn: e.target.value }))} />
            </Field>
          </div>

          <div className="overflow-hidden rounded-md border border-[#d7e3e5]">
            <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 bg-[#f7fafa] px-3 py-2 text-[10px] font-bold tracking-[0.08em] text-[#779097] uppercase">
              <span>ชุดตรวจที่ยังคืนได้</span>
              <span className="text-right">จำนวนคืน</span>
            </div>
            <div className="max-h-[430px] divide-y divide-[#edf2f2] overflow-y-auto">
              {candidates.map(({ distribution, line, alreadyReturned, remaining, daysToExpiry }) => {
                const key = line.id ?? ''
                const nearExpiry = daysToExpiry !== null && daysToExpiry <= 90
                const expired = daysToExpiry !== null && daysToExpiry < 0
                return (
                  <div key={key} className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-[#315763]">{[line.itemCode, line.itemName].filter(Boolean).join(' · ')}</p>
                        {expired ? <StatusBadge tone="rejected" label="expired" /> : nearExpiry ? <StatusBadge tone="warning" label="ใกล้หมดอายุ" /> : null}
                      </div>
                      <p className="mono mt-0.5 text-xs text-[#789097]">Lot {line.lotNumber ?? '-'} · {line.locationCode ?? '-'} · exp {line.expiryDate ? formatDate(line.expiryDate) : '-'}</p>
                      <p className="text-xs text-[#91a4a9]">เบิก {formatDate(distribution.distributedOn)} · คืนแล้ว {alreadyReturned} · คืนได้ {remaining} {line.unit ?? 'ชุด'}</p>
                    </div>
                    <Input
                      inputMode="numeric"
                      type="number"
                      min={0}
                      max={remaining}
                      value={quantities[key] ?? ''}
                      onChange={(e) => setQuantities((current) => ({ ...current, [key]: e.target.value }))}
                      className="text-right mono"
                      placeholder="0"
                    />
                  </div>
                )
              })}
              {!candidates.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">ไม่มีชุดตรวจที่ยังคืนได้สำหรับหน่วยตรวจนี้</p> : null}
            </div>
          </div>

          <Field label="Note"><Textarea rows={2} value={form.note} onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))} /></Field>
          <Button disabled={busy || !selectedLines.length} className="w-full justify-center"><RotateCcw className="size-4" /> บันทึกคืนชุดตรวจ</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3 font-bold text-[#173d50]">ประวัติคืนชุดตรวจ</div>
        <div className="divide-y divide-[#edf2f2]">
          {pagedKitReturns.map((kitReturn) => (
            <div key={kitReturn.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[#315763]">{kitReturn.siteName}</p>
                  <p className="text-xs text-[#8ba0a5]">{formatDate(kitReturn.returnedOn)} · {kitReturn.createdByName ?? '-'}</p>
                </div>
                <StatusBadge tone="accepted" label={`${kitReturn.quantity} ชุด`} />
              </div>
              <div className="space-y-1">
                {kitReturn.lines.map((line) => (
                  <p key={line.id} className="text-xs text-[#55727c]">
                    <span className="font-bold">{line.itemCode ?? line.itemName ?? '-'}</span>
                    <span className="mono"> · LOT {line.lotNumber ?? '-'} · {line.locationCode ?? '-'} · {line.quantity}</span>
                  </p>
                ))}
              </div>
              {kitReturn.note ? <p className="text-xs text-[#789097]">{kitReturn.note}</p> : null}
            </div>
          ))}
          {!data.kitReturns.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">ยังไม่มีประวัติคืนชุดตรวจ</p> : null}
        </div>
        {data.kitReturns.length > 10 ? <Pagination {...returnsPagination} total={data.kitReturns.length} onChange={returnsPagination.setPage} /> : null}
      </Card>
    </div>
  )
}

function ReceiptsTab({ actor, data, onWorkspace, onNotice }: {
  actor: BmActor
  data: HpvWorkspace
  onWorkspace: (workspace: HpvWorkspace, text: string) => void
  onNotice: (notice: { tone: 'success' | 'danger' | 'warning' | 'info'; text: string } | null) => void
}) {
  const activeSites = data.sites.filter((site) => site.isActive)
  const [form, setForm] = useState({ siteId: activeSites[0]?.id ?? '', receivedOn: todayKey(), sampleCount: '1', note: '' })
  const [editingReceipt, setEditingReceipt] = useState<{ id: string; receivedOn: string; sampleCount: string; note: string } | null>(null)
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

  function exportReceipts() {
    const headers = ['วันที่ส่ง', 'หน่วยงาน', 'จำนวนตัวอย่าง', 'Note', 'บันทึกโดย']
    const rows = data.receipts.map((r: HpvSiteReceipt) => [r.receivedOn, r.siteName, String(r.sampleCount), r.note ?? '', r.createdByName ?? ''])
    downloadCsv(`HPV_receipts_${todayKey()}.csv`, [headers, ...rows])
  }

  async function saveReceipt(event: React.FormEvent) {
    event.preventDefault()
    if (!editingReceipt) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/receipts/${editingReceipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ receivedOn: editingReceipt.receivedOn, sampleCount: Number(editingReceipt.sampleCount), note: editingReceipt.note.trim() || null }),
      })
      onWorkspace(result.workspace, 'แก้ไข Receive Log แล้ว')
      setEditingReceipt(null)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'แก้ไขไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className={`p-4 ${editingReceipt ? 'ring-1 ring-[#0b7f76]' : ''}`}>
        {editingReceipt ? (
          <form onSubmit={saveReceipt} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#173d50]">แก้ไข Receive Log</h2>
              <button type="button" onClick={() => setEditingReceipt(null)} className="text-[#8ba0a5] hover:text-[#315763]"><X className="size-4" /></button>
            </div>
            <Field label="วันที่ส่ง"><Input required type="date" value={editingReceipt.receivedOn} onChange={(e) => setEditingReceipt({ ...editingReceipt, receivedOn: e.target.value })} /></Field>
            <Field label="จำนวนตัวอย่าง"><Input required type="number" min="1" step="1" value={editingReceipt.sampleCount} onChange={(e) => setEditingReceipt({ ...editingReceipt, sampleCount: e.target.value })} /></Field>
            <Field label="Note"><Textarea rows={3} value={editingReceipt.note} onChange={(e) => setEditingReceipt({ ...editingReceipt, note: e.target.value })} /></Field>
            <Button disabled={busy}><CheckCircle2 className="size-4" /> บันทึกแก้ไข</Button>
          </form>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <h2 className="font-bold text-[#173d50]">บันทึกตัวอย่างส่งกลับ</h2>
            <Field label="หน่วยงาน"><Select required value={selectedSiteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>{activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></Field>
            <Field label="วันที่ส่ง"><Input required type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} /></Field>
            <Field label="จำนวนตัวอย่าง"><Input required type="number" min="1" step="1" value={form.sampleCount} onChange={(e) => setForm({ ...form, sampleCount: e.target.value })} /></Field>
            <Field label="Note"><Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <Button disabled={busy || !selectedSiteId}><ClipboardCheck className="size-4" /> Save receive log</Button>
          </form>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <span className="font-bold text-[#173d50]">Recent receive logs</span>
          <button onClick={exportReceipts} className="flex items-center gap-1.5 rounded border border-[#c7dde0] bg-[#f5f9fa] px-2.5 py-1.5 text-xs font-bold text-[#55727c] hover:bg-[#ebf5f6]"><Download className="size-3.5" /> Export CSV</button>
        </div>
        <div className="divide-y divide-[#edf2f2]">
          {data.receipts.map((receipt) => (
            <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div><p className="font-bold text-[#315763]">{receipt.siteName}</p><p className="text-xs text-[#8ba0a5]">{formatDate(receipt.receivedOn)} · {receipt.createdByName ?? '-'}</p>{receipt.note ? <p className="mt-1 text-xs text-[#6f868b]">{receipt.note}</p> : null}</div>
              <div className="flex items-center gap-3">
                <p className="mono text-lg font-bold text-[#0b7f76]">{receipt.sampleCount}</p>
                {actor.role === 'Admin' ? (
                  <button onClick={() => setEditingReceipt({ id: receipt.id, receivedOn: receipt.receivedOn, sampleCount: String(receipt.sampleCount), note: receipt.note ?? '' })} className="flex items-center gap-1 rounded border border-[#c7dde0] bg-[#f5f9fa] px-2 py-1 text-[10px] font-bold text-[#55727c] hover:bg-[#ebf5f6]"><Pencil className="size-3" /></button>
                ) : null}
              </div>
            </div>
          ))}
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
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null)
  const [barcode, setBarcode] = useState('')
  const [busy, setBusy] = useState(false)
  const [boxForm, setBoxForm] = useState({ boxCode: `HPV-${todayKey().replaceAll('-', '')}-01` })
  const [specimenType, setSpecimenType] = useState<HpvSpecimenType>('self_collected')
  const effectiveBoxId = data.boxes.some((box) => box.id === selectedBoxId) ? selectedBoxId : openBoxes[0]?.id ?? data.boxes[0]?.id ?? ''
  const selectedBox = data.boxes.find((box) => box.id === effectiveBoxId) ?? data.boxes[0] ?? null
  const scanBox = openBoxes.find((box) => box.id === effectiveBoxId) ?? openBoxes[0] ?? null
  const [searchBarcode, setSearchBarcode] = useState('')
  const searchResult = useMemo(() => {
    const code = searchBarcode.trim()
    if (!code) return null
    for (const box of data.boxes) {
      const sample = box.samples.find((s) => s.barcode === code)
      if (sample) return { box, sample }
    }
    return 'not_found' as const
  }, [searchBarcode, data.boxes])

  useEffect(() => { setSelectedPosition(null) }, [effectiveBoxId])

  async function scan(codeInput = barcode) {
    const code = normalizeScan(codeInput)
    if (!code || !scanBox) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/storage/scan', {
        method: 'POST',
        body: JSON.stringify({ barcode: code, boxId: scanBox.id, specimenType, position: selectedPosition ?? undefined }),
      })
      onWorkspace(result.workspace, `จัดเก็บ sample ${code}${selectedPosition ? ` ที่ ${formatHpvBoxPosition(selectedPosition)}` : ''} แล้ว`)
      setBarcode('')
      setSelectedPosition(null)
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

  async function moveOrSwap(sampleId: string, toPosition: number) {
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/storage/samples/${sampleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ position: toPosition }),
      })
      onWorkspace(result.workspace, 'ย้าย sample แล้ว')
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ย้าย sample ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function deleteSample(sample: HpvSample) {
    if (!window.confirm(`ลบ sample "${sample.barcode}" ออกจากกล่องใช่ไหม?`)) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/storage/samples/${sample.id}`, { method: 'DELETE' })
      onWorkspace(result.workspace, `ลบ sample ${sample.barcode} แล้ว`)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ลบ sample ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function closeBox(box: HpvStorageBox) {
    if (!window.confirm(`ปิดกล่อง "${box.boxCode}" ใช่ไหม?\n\nจะเริ่มนับเวลารอทิ้ง 1 เดือนทันที`)) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/storage/boxes/${box.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'close' }),
      })
      onWorkspace(result.workspace, `ปิดกล่อง ${box.boxCode} แล้ว เริ่มนับเวลารอทิ้ง`)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ปิดกล่องไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function reopenBox(box: HpvStorageBox) {
    if (!window.confirm(`เปิดกล่อง "${box.boxCode}" กลับใช้งานใช่ไหม?\n\nกำหนดวันทำลายจะถูกล้าง แต่ sample เดิมจะยังอยู่`)) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/storage/boxes/${box.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reopen' }),
      })
      onWorkspace(result.workspace, `เปิดกล่อง ${box.boxCode} กลับใช้งานแล้ว`)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เปิดกล่องกลับไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function destroyBox(box: HpvStorageBox) {
    if (!window.confirm(`บันทึกทำลายกล่อง "${box.boxCode}" ใช่ไหม?\n\nไม่สามารถย้อนกลับได้`)) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/storage/boxes/${box.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'destroy' }),
      })
      onWorkspace(result.workspace, `บันทึกทำลายกล่อง ${box.boxCode} แล้ว`)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกทำลายกล่องไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function deleteBox(box: HpvStorageBox) {
    if (!window.confirm(`ลบกล่อง "${box.boxCode}" ใช่ไหม?\n\nถ้ามี sample อยู่ในกล่องจะลบไม่ได้`)) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/storage/boxes/${box.id}`, { method: 'DELETE' })
      onWorkspace(result.workspace, 'ลบ storage box แล้ว')
      setSelectedBoxId('')
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ลบกล่องไม่สำเร็จ' })
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
            <Button disabled={busy}><Plus className="size-4" /> Open box</Button>
          </form>
        </Card>
        <Card className="p-4">
          <form onSubmit={(e) => { e.preventDefault(); void scan() }} className="space-y-3">
            <h2 className="font-bold text-[#173d50]">ยิงบาร์โค้ดเข้า box</h2>
            <Field label="Active box">
              {openBoxes.length ? (
                <Select value={scanBox?.id ?? ''} onChange={(e) => { setSelectedBoxId(e.target.value) }}>{openBoxes.map((box) => <option key={box.id} value={box.id}>{box.boxCode}</option>)}</Select>
              ) : (
                <p className="rounded-md border border-dashed border-[#d7e3e5] px-3 py-2 text-sm text-[#8ba0a5]">ยังไม่มีกล่องที่เปิดอยู่ — เปิดกล่องใหม่ก่อน</p>
              )}
            </Field>
            <Field label="Specimen type">
              <div role="group" aria-label="Specimen type" className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={specimenType === 'self_collected'}
                  onClick={() => setSpecimenType('self_collected')}
                  className={`rounded-md border px-3 py-2 text-sm font-bold transition ${specimenType === 'self_collected' ? 'border-[#0b7f76] bg-[#e7f7f4] text-[#08766e] ring-2 ring-[#0b7f76]/20' : 'border-[#c9dadd] bg-white text-[#58747d] hover:border-[#69b8b0]'}`}
                >
                  Self-collected
                </button>
                <button
                  type="button"
                  aria-pressed={specimenType === 'clinician_collected'}
                  onClick={() => setSpecimenType('clinician_collected')}
                  className={`rounded-md border px-3 py-2 text-sm font-bold transition ${specimenType === 'clinician_collected' ? 'border-[#d8a936] bg-[#fff7df] text-[#9a6700] ring-2 ring-[#d8a936]/20' : 'border-[#c9dadd] bg-white text-[#58747d] hover:border-[#d8a936]'}`}
                >
                  Clinician-collected
                </button>
              </div>
            </Field>
            {selectedPosition ? (
              <div className="flex items-center justify-between rounded-md border border-[#97d5cf] bg-[#eef9f7] px-3 py-2 text-sm">
                <span className="font-semibold text-[#0b7f76]">ตำแหน่ง: <span className="mono font-bold">{formatHpvBoxPosition(selectedPosition)}</span></span>
                <button type="button" onClick={() => setSelectedPosition(null)} className="text-[#8ba0a5] hover:text-[#315763]"><X className="size-4" /></button>
              </div>
            ) : (
              <p className="text-xs text-[#8ba0a5]">กดที่ช่องว่างในกริดเพื่อเลือกตำแหน่ง หรือ auto-fill</p>
            )}
            <div className="relative"><ScanLine className="absolute top-3 left-3 size-5 text-[#88a1a7]" /><Input autoFocus value={barcode} onChange={(e) => setBarcode(e.target.value)} className="h-12 pl-11 mono text-base" placeholder="Sample barcode" /></div>
            <div className="flex gap-2"><Button disabled={busy || !scanBox}><QrCode className="size-4" /> Store sample</Button><Button type="button" variant="secondary" onClick={() => setCameraOn((value) => !value)}>{cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} Camera</Button></div>
            {cameraOn ? <div className="relative overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" /><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="barcode-guide-frame relative h-[34%] w-[78%] rounded-lg border-2 border-[#5de1d0] shadow-[0_0_0_999px_rgba(0,0,0,.22),0_0_18px_rgba(93,225,208,.8)]"><span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#073f3a]/90 px-3 py-1 text-[11px] font-bold text-white">จัดบาร์โค้ดให้อยู่ในกรอบ</span></div></div></div> : null}
          </form>
        </Card>
        <Card className="p-4 space-y-3">
          <h2 className="font-bold text-[#173d50]">ค้นหา Sample</h2>
          <div className="relative"><Search className="absolute top-3 left-3 size-4 text-[#88a1a7]" /><Input value={searchBarcode} onChange={(e) => setSearchBarcode(e.target.value)} className="pl-9" placeholder="Sample barcode" /></div>
          {searchBarcode.trim() && searchResult === 'not_found' ? (
            <p className="text-xs text-red-500">ไม่พบ barcode นี้ในระบบ</p>
          ) : searchBarcode.trim() && searchResult && searchResult !== 'not_found' ? (
            <div className="rounded-md bg-[#eef9f7] p-3">
              <p className="text-sm font-bold text-[#0b7f76]">{searchResult.box.boxCode}</p>
              <div className="mt-1 flex items-center gap-2"><p className="text-xs text-[#789097]">{formatHpvBoxPosition(searchResult.sample.position)} · {searchResult.sample.status}</p><SpecimenTypeBadge type={searchResult.sample.specimenType} /></div>
              <button type="button" onClick={() => { setSelectedBoxId(searchResult.box.id); setSelectedPosition(null) }} className="mt-1.5 text-xs font-bold text-[#0b7f76] underline hover:no-underline">ไปที่กล่องนี้</button>
            </div>
          ) : null}
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3 font-bold text-[#173d50]">
            Storage boxes <span className="ml-1 text-sm font-normal text-[#8ba0a5]">({data.boxes.length})</span>
          </div>
          {data.boxes.length ? (
            <div className="max-h-[210px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase">
                  <tr><th className="px-4 py-2">Code</th><th className="px-2 py-2 text-center">Stored</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Destroy due</th><th className="px-2 py-2 text-right">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f2]">
                  {data.boxes.map((box) => {
                    const isSelected = effectiveBoxId === box.id
                    const destructionState = getHpvDestructionState(box.destroyDueAt, box.status, today)
                    const remainingDays = box.destroyDueAt ? daysUntil(bangkokDateKey(box.destroyDueAt), today) : 0
                    const storedCount = box.samples.filter((s) => s.status === 'stored').length
                    return (
                      <tr key={box.id} onClick={() => setSelectedBoxId(box.id)} className={`cursor-pointer transition-colors ${isSelected ? 'bg-[#eef9f7]' : 'hover:bg-[#f7fbfc]'}`}>
                        <td className="mono px-4 py-2 font-bold text-[#315763]">{box.boxCode}</td>
                        <td className="mono px-2 py-2 text-center font-bold text-[#315763]">{storedCount}/{box.capacity}</td>
                        <td className="px-2 py-2"><StatusBadge tone={box.status === 'open' ? 'accepted' : box.status === 'full' ? 'warning' : 'neutral'} label={box.status.toUpperCase()} /></td>
                        <td className="px-2 py-2 text-xs">{destructionState === 'due_soon' ? <StatusBadge tone="warning" label={`เหลือ ${remainingDays} วัน`} /> : destructionState === 'due_now' ? <StatusBadge tone="rejected" label="ครบกำหนดทำลาย" /> : <span className="text-[#8ba0a5]">{box.destroyDueAt ? formatDate(box.destroyDueAt) : '-'}</span>}</td>
                        <td className="px-2 py-2 text-right">{box.status === 'open' ? <button type="button" onClick={(event) => { event.stopPropagation(); void closeBox(box) }} className="rounded border border-[#c7a850] bg-[#fdf8ed] px-2 py-1 text-[10px] font-bold text-[#8a6d1e] hover:bg-[#f9efc8]">ปิดกล่อง</button> : box.status === 'full' ? <button type="button" onClick={(event) => { event.stopPropagation(); void reopenBox(box) }} className="rounded border border-[#83bcb6] bg-[#eef9f7] px-2 py-1 text-[10px] font-bold text-[#08766e] hover:bg-[#dff3ef]">เปิดกล่องกลับ</button> : null}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-[#91a4a9]">ยังไม่มี Storage box</p>
          )}
        </Card>
        <BoxPanel box={selectedBox} today={today} selectedPosition={selectedPosition} onSelectPosition={setSelectedPosition} onMove={moveOrSwap} onClose={closeBox} onReopen={reopenBox} onDestroy={destroyBox} onDelete={deleteBox} onDeleteSample={deleteSample} />
      </div>
    </div>
  )
}

function BoxPanel({ box, today, selectedPosition, onSelectPosition, onMove, onClose, onReopen, onDestroy, onDelete, onDeleteSample }: {
  box: HpvStorageBox | null
  today: string
  selectedPosition?: number | null
  onSelectPosition?: (pos: number | null) => void
  onMove?: (sampleId: string, toPosition: number) => void
  onClose?: (box: HpvStorageBox) => void
  onReopen?: (box: HpvStorageBox) => void
  onDestroy?: (box: HpvStorageBox) => void
  onDelete?: (box: HpvStorageBox) => void
  onDeleteSample?: (sample: HpvSample) => void
}) {
  const [dragOver, setDragOver] = useState<number | null>(null)

  if (!box) return <Card className="flex min-h-[520px] items-center justify-center p-8 text-center text-sm text-[#789097]">ยังไม่มี Storage box</Card>
  const sampleMap = new Map(box.samples.map((sample) => [sample.position, sample]))
  const occupied = box.samples.length
  const destructionState = getHpvDestructionState(box.destroyDueAt, box.status, today)
  const remainingDays = box.destroyDueAt ? daysUntil(bangkokDateKey(box.destroyDueAt), today) : 0
  const canInteract = box.status === 'open'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eaeb] bg-[linear-gradient(115deg,#fafdfe,#eef9f7)] px-4 py-4">
        <div>
          <h2 className="mt-1 text-xl font-bold text-[#173d50]">{box.boxCode}</h2>
          <p className="mt-1 text-xs text-[#789097]">{occupied}/{HPV_BOX_CAPACITY} positions · created {formatDateTime(box.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={box.status === 'open' ? 'accepted' : box.status === 'full' ? 'warning' : 'neutral'} label={box.status.toUpperCase()} />
          {destructionState === 'due_soon' ? <StatusBadge tone="warning" label={`เหลือ ${remainingDays} วัน`} /> : null}
          {destructionState === 'due_now' ? <StatusBadge tone="rejected" label="ครบกำหนดทำลาย" /> : null}
          {destructionState === 'none' && box.destroyDueAt ? <StatusBadge tone="neutral" label={`Destroy due ${formatDate(box.destroyDueAt)}`} /> : null}
          {onClose && box.status === 'open' ? <button onClick={() => onClose(box)} className="flex items-center gap-1 rounded border border-[#c7a850] bg-[#fdf8ed] px-2 py-1 text-[10px] font-bold text-[#8a6d1e] hover:bg-[#f9efc8]"><CheckCircle2 className="size-3" /> ปิดกล่อง</button> : null}
          {onReopen && box.status === 'full' ? <button onClick={() => onReopen(box)} className="flex items-center gap-1 rounded border border-[#83bcb6] bg-[#eef9f7] px-2 py-1 text-[10px] font-bold text-[#08766e] hover:bg-[#dff3ef]"><RotateCcw className="size-3" /> เปิดกล่องกลับ</button> : null}
          {onDestroy && box.status === 'full' ? <button onClick={() => onDestroy(box)} className="flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100"><Flame className="size-3" /> ทำลาย</button> : null}
          {onDelete ? <button onClick={() => onDelete(box)} className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-100"><Trash2 className="size-3" /> ลบกล่อง</button> : null}
        </div>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: HPV_BOX_CAPACITY }, (_, index) => {
            const position = index + 1
            const sample = sampleMap.get(position)
            const checkedOut = sample?.status === 'checked_out'
            const isSelected = !sample && selectedPosition === position
            const isDragTarget = dragOver === position

            let cellClass = 'aspect-square rounded-md border p-2 transition-colors '
            if (isSelected) {
              cellClass += 'border-[#0b7f76] bg-[#d4f0ed] ring-2 ring-[#0b7f76] cursor-pointer'
            } else if (isDragTarget) {
              cellClass += 'border-[#0b7f76] bg-[#e5f6f4] ring-2 ring-dashed ring-[#0b7f76]'
            } else if (sample) {
              cellClass += checkedOut
                ? 'border-[#d2dee0] bg-[#f6f9f9]'
                : 'border-[#97d5cf] bg-[#eef9f7] cursor-grab active:cursor-grabbing'
            } else {
              cellClass += canInteract && onSelectPosition
                ? 'border-dashed border-[#d7e3e5] bg-white hover:border-[#0b7f76] hover:bg-[#f0faf9] cursor-pointer'
                : 'border-dashed border-[#d7e3e5] bg-white'
            }

            return (
              <div
                key={position}
                className={cellClass}
                draggable={!!sample && sample.status === 'stored' && !!onMove}
                onClick={() => {
                  if (!sample && canInteract && onSelectPosition) {
                    onSelectPosition(selectedPosition === position ? null : position)
                  }
                }}
                onDragStart={(e) => {
                  if (sample) {
                    e.dataTransfer.setData('text/plain', sample.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOver(position)
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(null)
                  const sampleId = e.dataTransfer.getData('text/plain')
                  if (sampleId && onMove) onMove(sampleId, position)
                }}
              >
                <p className="mono text-[10px] font-bold text-[#789097]">{formatHpvBoxPosition(position)}</p>
                {sample
                  ? <><p className={`mono mt-1 truncate text-[10px] font-bold leading-tight ${checkedOut ? 'text-[#6f868b]' : 'text-[#0b7f76]'}`}>{sample.barcode}</p><div className="mt-1"><SpecimenTypeBadge type={sample.specimenType} compact /></div></>
                  : isSelected
                    ? <p className="mt-1 text-[10px] font-bold text-[#0b7f76]">selected</p>
                    : <p className="mt-1 text-[10px] text-[#b4c3c6]">empty</p>
                }
              </div>
            )
          })}
        </div>
        <div className="max-h-[520px] overflow-y-auto rounded-md border border-[#e1eaeb]">
          {box.samples.map((sample) => <div key={sample.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2f2] px-3 py-2 last:border-0">
            <div><p className="mono font-bold text-[#315763]">{sample.barcode}</p><p className="text-xs text-[#8ba0a5]">{formatHpvBoxPosition(sample.position)} · stored {formatDateTime(sample.storedAt)} · {sample.storedByName ?? '-'}</p></div>
            <div className="flex items-center gap-2">
              <SpecimenTypeBadge type={sample.specimenType} />
              <StatusBadge tone={sample.status === 'stored' ? 'accepted' : 'neutral'} label={sample.status} />
              {onDeleteSample && sample.status === 'stored' ? <button onClick={() => onDeleteSample(sample)} className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-500 hover:bg-red-100"><Trash2 className="size-3" /></button> : null}
            </div>
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
  const [destination, setDestination] = useState('Co-testing')
  const [customDestination, setCustomDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const effectiveDestination = destination === 'อื่นๆ' ? customDestination.trim() || 'อื่นๆ' : destination
  const storedSamples = data.boxes.flatMap((box) => box.samples.map((sample) => ({ ...sample, box }))).filter((sample) => sample.status === 'stored')
  const checkedOutSamples = useMemo(() => {
    const fromBoxes = data.boxes.flatMap((box) => box.samples.filter((s) => s.status === 'checked_out').map((sample) => ({ ...sample, box: box as HpvStorageBox | null })))
    const external = data.externalSamples.filter((s) => s.status === 'checked_out').map((sample) => ({ ...sample, box: null as HpvStorageBox | null }))
    return [...fromBoxes, ...external].sort((a, b) => (b.checkedOutAt ?? '').localeCompare(a.checkedOutAt ?? ''))
  }, [data.boxes, data.externalSamples])
  const filteredCheckedOutSamples = useMemo(() => {
    const term = historySearch.trim().toLowerCase()
    if (!term) return checkedOutSamples
    return checkedOutSamples.filter((sample) =>
      [sample.barcode, sample.box?.boxCode, sample.checkoutDestination, sample.checkoutNote, sample.checkedOutByName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(term)),
    )
  }, [checkedOutSamples, historySearch])
  const historyPagination = usePagination(filteredCheckedOutSamples.length, 10)
  const pagedCheckedOutSamples = filteredCheckedOutSamples.slice(historyPagination.start, historyPagination.end)

  function exportCheckout() {
    const rows = [
      ['Barcode', 'Box', 'Position', 'From storage box', 'Destination', 'Note', 'Checkout At', 'By'],
      ...checkedOutSamples.map((s) => [
        s.barcode,
        s.box?.boxCode ?? '-',
        s.box ? formatHpvBoxPosition(s.position) : '-',
        s.fromStorageBox ? 'Yes' : 'No',
        s.checkoutDestination ?? 'Co-testing',
        s.checkoutNote ?? '',
        s.checkedOutAt ? formatDateTime(s.checkedOutAt) : '',
        s.checkedOutByName ?? '',
      ]),
    ]
    downloadCsv(`hpv_checkout_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  async function checkout(codeInput = barcode) {
    const code = normalizeScan(codeInput)
    if (!code) return
    const isExternal = !storedSamples.some((sample) => sample.barcode === code)
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>('/api/hpv/storage/checkout', {
        method: 'POST',
        body: JSON.stringify({ barcode: code, destination: effectiveDestination, note: note.trim() || null, specimenType: isExternal ? 'clinician_collected' : undefined }),
      })
      onWorkspace(result.workspace, isExternal ? `Checkout ${code} ไป ${effectiveDestination} แล้ว (ไม่ได้มาจาก storage box)` : `Checkout ${code} ไป ${effectiveDestination} แล้ว`)
      setBarcode('')
      setNote('')
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Checkout ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  async function undoCheckout(sample: HpvSample) {
    const confirmText = sample.fromStorageBox
      ? `ยกเลิก checkout "${sample.barcode}" ใช่ไหม?\n\nจะย้อนกลับไปเป็น stored ในกล่องเดิม`
      : `ลบ checkout "${sample.barcode}" ใช่ไหม?\n\nรายการนี้ไม่ได้มาจาก storage box จะถูกลบออกทั้งหมด`
    if (!window.confirm(confirmText)) return
    setBusy(true)
    try {
      const result = await api<{ workspace: HpvWorkspace }>(`/api/hpv/storage/samples/${sample.id}/checkout`, { method: 'DELETE' })
      onWorkspace(result.workspace, sample.fromStorageBox ? `ยกเลิก checkout ${sample.barcode} แล้ว` : `ลบ checkout ${sample.barcode} แล้ว`)
    } catch (error) {
      onNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ยกเลิก checkout ไม่สำเร็จ' })
    } finally {
      setBusy(false)
    }
  }

  const { cameraOn, setCameraOn, videoRef } = useCameraScanner((code) => { void checkout(code) }, (text) => onNotice({ tone: 'danger', text }))

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); void checkout() }} className="space-y-3">
          <h2 className="font-bold text-[#173d50]">Checkout</h2>
          <div className="relative"><ScanLine className="absolute top-3 left-3 size-5 text-[#88a1a7]" /><Input autoFocus value={barcode} onChange={(e) => setBarcode(e.target.value)} className="h-12 pl-11 mono text-base" placeholder="Sample barcode" /></div>
          <p className="text-xs text-[#8ba0a5]">ถ้า barcode นี้ไม่มีอยู่ใน storage box ระบบจะบันทึก checkout ให้และทำสัญลักษณ์ว่าไม่ได้มาจาก storage box (ระบุเป็น Clinician-collected โดยอัตโนมัติ)</p>
          <Field label="Destination"><Select value={destination} onChange={(e) => setDestination(e.target.value)}><option>Co-testing</option><option>GeneXpert</option><option>PCR</option><option>อื่นๆ</option></Select></Field>
          {destination === 'อื่นๆ' ? <Field label="ระบุ"><Input value={customDestination} onChange={(e) => setCustomDestination(e.target.value)} placeholder="ระบุปลายทาง" /></Field> : null}
          <Field label="Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex gap-2"><Button disabled={busy || !barcode.trim()}><CheckCircle2 className="size-4" /> Checkout</Button><Button type="button" variant="secondary" onClick={() => setCameraOn((value) => !value)}>{cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} Camera</Button></div>
          {cameraOn ? <div className="overflow-hidden rounded-md border border-[#d6e2e3] bg-black"><video ref={videoRef} className="aspect-video w-full object-cover" /></div> : null}
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <span className="font-bold text-[#173d50]">Checkout history ({filteredCheckedOutSamples.length}{historySearch.trim() ? ` / ${checkedOutSamples.length}` : ''})</span>
          {checkedOutSamples.length > 0 ? <Button variant="ghost" className="gap-1 px-2 py-1 text-xs" onClick={exportCheckout}><Download className="size-3" /> Export CSV</Button> : null}
        </div>
        <div className="border-b border-[#edf2f2] px-4 py-2.5">
          <div className="relative">
            <Search className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" />
            <Input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="pl-9" placeholder="ค้นหา barcode, box, destination, note, ผู้บันทึก" />
          </div>
        </div>
        <div className="divide-y divide-[#edf2f2]">
          {pagedCheckedOutSamples.map((sample) => (
            <div key={sample.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="mono text-sm font-bold text-[#315763]">{sample.barcode}</p>
                  <SpecimenTypeBadge type={sample.specimenType} />
                  {!sample.fromStorageBox ? <StatusBadge tone="warning" label="ไม่ได้มาจาก Storage box" /> : null}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-[#8ba0a5]">
                  <Boxes className="size-3.5 shrink-0" aria-hidden="true" />
                  {sample.box ? `${sample.box.boxCode} · ${formatHpvBoxPosition(sample.position)}` : 'ไม่มีข้อมูลกล่อง'}
                </p>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-[#0b7f76]">
                  <Send className="size-3.5 shrink-0" aria-hidden="true" />
                  {sample.checkoutDestination ?? 'Co-testing'}
                </p>
                {sample.checkoutNote ? <p className="border-l-2 border-[#e1eaeb] pl-2 text-xs text-[#789097] italic">{sample.checkoutNote}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <button onClick={() => void undoCheckout(sample)} className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500 hover:bg-red-100"><Trash2 className="size-3" /> ลบ</button>
                <div className="text-right text-xs text-[#8ba0a5]">
                  <p className="mono">{sample.checkedOutAt ? formatDateTime(sample.checkedOutAt) : '-'}</p>
                  <p className="mt-0.5 font-medium text-[#55727c]">{sample.checkedOutByName ?? '-'}</p>
                </div>
              </div>
            </div>
          ))}
          {!checkedOutSamples.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">ยังไม่มี Checkout</p> : null}
          {checkedOutSamples.length > 0 && !filteredCheckedOutSamples.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">ไม่พบรายการที่ตรงกับคำค้นหา</p> : null}
        </div>
        {filteredCheckedOutSamples.length > 10 ? <Pagination {...historyPagination} total={filteredCheckedOutSamples.length} onChange={historyPagination.setPage} /> : null}
      </Card>
    </div>
  )
}
