'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, History, PackageCheck } from 'lucide-react'
import type { ReceivingWorkspace } from '@/lib/receiving/types'
import { Card, Notice, PageHeader, StatCard, StatusBadge, Tabs } from '@/components/ui'
import { InvoiceEditor } from '@/components/receiving/invoice-editor'
import { ReceiptDraft } from '@/components/receiving/receipt-draft'

type ReceivingTab = 'receive' | 'invoices' | 'history'

export function ReceivingView({ initialData, isAdmin = false }: { initialData: ReceivingWorkspace; isAdmin?: boolean }) {
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
      {tab === 'invoices' ? <InvoiceEditor data={data} onSaved={onSaved} onError={onError} canCloseShort={isAdmin} /> : null}
      {tab === 'history' ? <HistoryList data={data} /> : null}
    </div>
  )
}

function HistoryList({ data }: { data: ReceivingWorkspace }) {
  const rows = data.receipts.filter((receipt) => receipt.status !== 'draft')
  return <Card className="overflow-hidden"><div className="divide-y divide-[#edf2f2]">{rows.map((receipt) => {
    const assessment = data.assessments.find((item) => item.receiptId === receipt.id)
    return <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><div><p className="font-semibold text-[#315763]">{receipt.receiptNo ?? receipt.id.slice(0, 8)}</p><p className="text-xs text-[#81979c]">{receipt.receivedDate} · {receipt.lines.length} lines · {receipt.stockTransactionId ? `ledger ${receipt.stockTransactionId.slice(0, 8)}` : 'ยังไม่มี ledger'}</p></div><div className="flex items-center gap-3">{assessment ? <StatusBadge tone={assessment.status === 'completed' ? 'accepted' : 'warning'} label={assessment.status === 'completed' ? 'ประเมินแล้ว' : 'รอประเมิน'} /> : null}<Link href={`/receiving/receipts/${receipt.id}/report`} className="text-xs font-semibold text-[#0b7f76] hover:underline">เปิดรายงาน</Link><StatusBadge tone={receipt.status === 'confirmed' ? 'accepted' : 'neutral'} label={receipt.status} /></div></div>
  })}{!rows.length ? <p className="p-8 text-center text-sm text-[#81979c]">ยังไม่มีประวัติ</p> : null}</div></Card>
}
