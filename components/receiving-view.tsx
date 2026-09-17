'use client'

import { useState } from 'react'
import { ClipboardList, FileText, History, PackageCheck, Plus } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { ReceivingWorkspace } from '@/lib/receiving/types'
import { api, Button, Card, Notice, PageHeader, StatCard, StatusBadge, Tabs } from '@/components/ui'
import { ReceiptDraft } from '@/components/receiving/receipt-draft'

type ReceivingTab = 'receive' | 'invoices' | 'history'

export function ReceivingView({ actor, initialData }: { actor: BmActor; initialData: ReceivingWorkspace }) {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<ReceivingTab>('receive')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  function onSaved(next: ReceivingWorkspace, text: string) {
    setData(next)
    setNotice({ tone: 'success', text })
  }

  function onError(text: string) {
    setNotice({ tone: 'danger', text })
  }

  const tabs = [
    { key: 'receive' as const, label: 'รับเข้า / Receive', icon: PackageCheck },
    { key: 'invoices' as const, label: 'ใบส่งของ / Invoices', icon: FileText },
    { key: 'history' as const, label: 'ประวัติ / History', icon: History },
  ]

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="Stock receiving" title="รับเข้าสินค้า / Receiving" description="ใบรับเข้าใหม่แยกจาก ledger เดิม และจะเขียน stock ผ่าน confirm path ที่ตรวจสอบซ้ำในฐานข้อมูล" />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="ร่างใบรับเข้า" value={data.receipts.filter((receipt) => receipt.status === 'draft').length} />
        <StatCard label="ยืนยันแล้ว" value={data.receipts.filter((receipt) => receipt.status === 'confirmed').length} tone="accepted" />
        <StatCard label="Vendor ใช้งาน" value={data.vendors.filter((vendor) => vendor.isActive).length} />
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'receive' ? <ReceiptDraft data={data} onSaved={onSaved} onError={onError} /> : null}
      {tab === 'invoices' ? <InvoiceList data={data} onSaved={onSaved} onError={onError} /> : null}
      {tab === 'history' ? <HistoryList data={data} /> : null}
    </div>
  )
}

function InvoiceList({ data, onSaved, onError }: { data: ReceivingWorkspace; onSaved: (data: ReceivingWorkspace, text: string) => void; onError: (text: string) => void }) {
  const [vendorId, setVendorId] = useState(data.vendors.find((vendor) => vendor.isActive)?.id ?? '')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [busy, setBusy] = useState(false)

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault()
    if (!vendorId) return
    setBusy(true)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>('/api/receiving/invoices', { method: 'POST', body: JSON.stringify({ vendorId, invoiceNo: invoiceNo || null, lines: [] }) })
      setInvoiceNo('')
      onSaved(result.receiving, 'สร้างใบส่งของแล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'สร้างใบส่งของไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return <div className="space-y-4">
    <Card className="p-4">
      <form onSubmit={createInvoice} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#58747d]">Vendor</span><select className="min-h-11 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm" value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="">เลือก vendor</option>{data.vendors.filter((vendor) => vendor.isActive).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.name}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold text-[#58747d]">เลขที่ใบส่งของ</span><input className="min-h-11 w-full rounded-md border border-[#cfdee0] px-3 py-2 text-sm" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="ไม่บังคับในร่าง" /></label>
        <Button disabled={busy || !vendorId}><Plus className="size-4" />สร้างร่าง</Button>
      </form>
    </Card>
    <Card className="overflow-hidden"><div className="flex items-center gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3"><ClipboardList className="size-4 text-[#0b7f76]" /><h2 className="font-bold">ใบส่งของ</h2></div><div className="divide-y divide-[#edf2f2]">{data.invoices.map((invoice) => { const vendor = data.vendors.find((item) => item.id === invoice.vendorId); return <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-semibold text-[#315763]">{invoice.invoiceNo ?? 'ยังไม่มีเลขที่'} · {vendor?.name ?? 'ไม่พบ vendor'}</p><p className="text-xs text-[#81979c]">{invoice.lines.length} lines · {invoice.status}</p></div><StatusBadge tone={invoice.status === 'closed' ? 'accepted' : invoice.status === 'cancelled' ? 'neutral' : 'warning'} label={invoice.status} /></div> })}{!data.invoices.length ? <p className="p-8 text-center text-sm text-[#81979c]">ยังไม่มีใบส่งของ</p> : null}</div></Card>
  </div>
}

function HistoryList({ data }: { data: ReceivingWorkspace }) {
  const rows = data.receipts.filter((receipt) => receipt.status !== 'draft')
  return <Card className="overflow-hidden"><div className="divide-y divide-[#edf2f2]">{rows.map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-semibold text-[#315763]">{receipt.receiptNo ?? receipt.id.slice(0, 8)}</p><p className="text-xs text-[#81979c]">{receipt.receivedDate} · {receipt.lines.length} lines · {receipt.stockTransactionId ? `ledger ${receipt.stockTransactionId.slice(0, 8)}` : 'ยังไม่มี ledger'}</p></div><StatusBadge tone={receipt.status === 'confirmed' ? 'accepted' : 'neutral'} label={receipt.status} /></div>)}{!rows.length ? <p className="p-8 text-center text-sm text-[#81979c]">ยังไม่มีประวัติ</p> : null}</div></Card>
}
