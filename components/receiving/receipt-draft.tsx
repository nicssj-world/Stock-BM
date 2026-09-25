'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, ClipboardList } from 'lucide-react'
import { remainingShelfLife, torExpiryCompliance } from '@/lib/bm/shelf-life'
import { receiptQuantitySummary, type ReceiptAssessmentAnswers } from '@/lib/receiving/assessment'
import { cumulativeReceived, receiptIssues } from '@/lib/receiving/rules'
import type { Receipt, ReceivingWorkspace } from '@/lib/receiving/types'
import { api, Button, Card, Notice, StatusBadge } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'
import { ReceiptAssessmentDialog, type ReceiptAssessmentContext } from '@/components/receiving/receipt-assessment-dialog'
import { ReceiptLineRow } from '@/components/receiving/receipt-line-row'
import { ReceiveDraftSavedError, ReceiveWizard, type ReceiveAdapter } from '@/components/receiving/receive-wizard'

export const INVOICE_EVIDENCE_KIND = 'invoice-image'

/** Quantity block for an already-confirmed receipt, derived from receipt data only. */
export function assessmentContextForReceipt(receipt: Receipt, data: ReceivingWorkspace): ReceiptAssessmentContext {
  const vendor = data.vendors.find((item) => item.id === receipt.vendorId)
  const confirmedUpTo = data.receipts.filter((candidate) => candidate.status === 'confirmed' && (candidate.confirmedAt ?? '') <= (receipt.confirmedAt ?? '\uffff'))
  const priorLines = confirmedUpTo.flatMap((candidate) => candidate.lines)
  return {
    receiptId: receipt.id,
    receiptLabel: receipt.receiptNo ?? receipt.id.slice(0, 8),
    vendorLabel: vendor ? `${vendor.code} · ${vendor.name}` : receipt.vendorId,
    receivedDate: receipt.receivedDate,
    quantity: receiptQuantitySummary(receipt.lines.map((line) => {
      const item = data.items.find((candidate) => candidate.id === line.stockItemId)
      const invoiceLine = receipt.invoiceId ? data.invoices.find((invoice) => invoice.id === receipt.invoiceId)?.lines.find((candidate) => candidate.id === line.invoiceLineId) : null
      return {
        lineNo: line.lineNo,
        itemLabel: item ? `${item.catalogNo ? `REF ${item.catalogNo} · ` : ''}${item.name}` : line.stockItemId,
        unit: item?.unit ?? '',
        receivedQty: line.receivedQty,
        expectedQty: invoiceLine?.expectedQty ?? line.expectedQty,
        cumulativeReceivedQty: line.invoiceLineId ? cumulativeReceived(priorLines.filter((candidate) => candidate.invoiceLineId === line.invoiceLineId)) : null,
      }
    })),
  }
}

export function ReceiptDraft({ data, onSaved, onError }: { data: ReceivingWorkspace; onSaved: (data: ReceivingWorkspace, text: string) => void; onError: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [assessment, setAssessment] = useState<ReceiptAssessmentContext | null>(null)
  const drafts = data.receipts.filter((receipt) => receipt.status === 'draft')
  const pending = data.assessments.filter((item) => item.status === 'pending')

  const adapter: ReceiveAdapter = {
    async submit(submission) {
      const created = await api<{ receiptId: string; receiving: ReceivingWorkspace }>('/api/receiving/receipts', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: submission.vendorId,
          invoiceId: submission.invoiceId,
          receiptNo: submission.receiptNo,
          receivedDate: submission.receivedDate,
          source: submission.lines.some((line) => line.barcodeRaw) ? 'scan' : 'manual',
          lines: submission.lines,
        }),
      })
      onSaved(created.receiving, 'สร้างร่างใบรับเข้าแล้ว — กำลังยืนยัน')
      if (submission.evidence) {
        const form = new FormData()
        form.append('file', submission.evidence.file)
        form.append('module', 'stock')
        form.append('entityType', 'stock-receipt')
        form.append('entityId', created.receiptId)
        form.append('kind', INVOICE_EVIDENCE_KIND)
        try {
          await api('/api/attachments', { method: 'POST', body: form })
        } catch (error) {
          throw new ReceiveDraftSavedError(`แนบรูปใบส่งของไม่สำเร็จ (${error instanceof Error ? error.message : 'upload failed'}) — ร่างใบรับเข้าถูกบันทึกไว้ด้านล่าง ยังไม่เขียน stock แนบรูปแล้วกดยืนยันอีกครั้ง`)
        }
      }
      try {
        const confirmed = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/receipts/${created.receiptId}/confirm`, { method: 'POST', body: '{}' })
        onSaved(confirmed.receiving, 'ยืนยันรับสินค้าและบันทึก stock แล้ว')
      } catch (error) {
        throw new ReceiveDraftSavedError(`${error instanceof Error ? error.message : 'ยืนยันรับสินค้าไม่สำเร็จ'} — ร่างใบรับเข้าถูกบันทึกไว้ด้านล่าง ยังไม่เขียน stock`)
      }
      return { receiptId: created.receiptId }
    },
  }

  async function submitAssessment(receiptId: string, answers: ReceiptAssessmentAnswers) {
    const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/receipts/${receiptId}/assessment`, {
      method: 'PUT',
      body: JSON.stringify({
        productCondition: answers.productCondition,
        documentation: answers.documentation,
        itemCorrectness: answers.itemCorrectness,
        coldChainApplicable: answers.coldChainApplicable,
        coldChainCondition: answers.coldChainCondition,
        hasComplaint: answers.hasComplaint,
        note: answers.note || null,
        reasonCodes: answers.reasonCodes,
        otherReasonDetail: answers.otherReasonDetail || null,
      }),
    })
    onSaved(result.receiving, 'บันทึกการประเมินการรับสินค้าแล้ว')
    setAssessment(null)
  }

  async function confirmDraft(id: string) {
    setBusy(true)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/receipts/${id}/confirm`, { method: 'POST', body: '{}' })
      onSaved(result.receiving, 'ยืนยันรับสินค้าและบันทึก stock แล้ว')
      const receipt = result.receiving.receipts.find((item) => item.id === id)
      if (receipt) setAssessment(assessmentContextForReceipt(receipt, result.receiving))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ยืนยันรับสินค้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function cancelDraft(id: string) {
    setBusy(true)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/receipts/${id}`, { method: 'DELETE' })
      onSaved(result.receiving, 'ยกเลิกร่างใบรับเข้าแล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ยกเลิกร่างไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return <div className="space-y-4">
    {pending.length ? <Card className="space-y-2 border-[#eed4a6] bg-[#fffaf0] p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-[#8f5f1d]"><ClipboardList className="size-4" />การประเมินที่รอดำเนินการ (Pending) · {pending.length}</p>
      <ul className="divide-y divide-[#f1e2c4]">{pending.map((item) => {
        const receipt = data.receipts.find((candidate) => candidate.id === item.receiptId)
        const vendor = data.vendors.find((candidate) => candidate.id === item.vendorId)
        return <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="text-[#76551c]">{receipt?.receiptNo ?? item.receiptId.slice(0, 8)} · {vendor?.name ?? '-'} · {receipt?.receivedDate ?? ''}</span>{receipt ? <Button type="button" variant="secondary" onClick={() => setAssessment(assessmentContextForReceipt(receipt, data))}>ประเมิน</Button> : null}</li>
      })}</ul>
    </Card> : null}

    <ReceiveWizard data={data} adapter={adapter} onError={onError} onReceived={({ assessment: context }) => setAssessment(context)} />

    {drafts.length ? <div className="space-y-3">
      <p className="text-xs font-bold tracking-[0.14em] text-[#58747d] uppercase">ร่างที่ยังไม่ยืนยัน (ยังไม่เขียน stock)</p>
      {drafts.map((receipt) => {
        const viewReceipt = { ...receipt, lines: receipt.lines.map((line) => ({ ...line, torExpiryCompliance: torExpiryCompliance(line.expiryDate, receipt.receivedDate), remainingShelfLifeDays: remainingShelfLife(line.expiryDate, receipt.receivedDate) })) }
        const issues = receiptIssues(viewReceipt, { expiryExceptionEnabled: data.policy.expiryExceptionEnabled })
        return <Card key={receipt.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Draft receipt</p><h2 className="mt-1 text-lg font-bold text-[#173d50]">{receipt.receiptNo ?? receipt.id.slice(0, 8)}</h2><p className="text-xs text-[#81979c]">{receipt.lines.length} line · received date {receipt.receivedDate}</p></div><StatusBadge tone="warning" label="draft" /></div>
          <AttachmentList module="stock" entityType="stock-receipt" entityId={receipt.id} kind={INVOICE_EVIDENCE_KIND} accept="image/*" label="รูปใบส่งของ / Invoice evidence" />
          <div className="grid gap-2">{receipt.lines.map((line) => <ReceiptLineRow key={line.id} line={line} receivedDate={receipt.receivedDate} data={data} onUpdated={(next) => onSaved(next, 'บันทึกเหตุผล TOR แล้ว')} />)}</div>
          {issues.length ? <Notice tone={issues.some((issue) => issue.target.includes('receiptDecision')) ? 'danger' : 'warning'}>{issues[0].message}</Notice> : <Notice tone="success">ข้อมูลพร้อมยืนยันรับสินค้า — ระบบจะตรวจสอบซ้ำในฐานข้อมูลก่อนเขียน ledger</Notice>}
          <div className="flex flex-wrap gap-2"><Button disabled={busy || issues.length > 0 || !receipt.lines.length} onClick={() => void confirmDraft(receipt.id)}><ClipboardCheck className="size-4" />ยืนยันรับสินค้า</Button><Button variant="ghost" disabled={busy} onClick={() => void cancelDraft(receipt.id)}>ยกเลิกร่าง</Button><Link href={`/receiving/receipts/${receipt.id}/report`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[#0b7f76] underline">ดูรายงาน</Link></div>
        </Card>
      })}
    </div> : null}

    {assessment ? <ReceiptAssessmentDialog key={assessment.receiptId} context={assessment} onSubmit={(answers) => submitAssessment(assessment.receiptId, answers)} onDismiss={() => setAssessment(null)} /> : null}
  </div>
}
