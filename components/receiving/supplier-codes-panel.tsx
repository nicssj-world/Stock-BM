'use client'

import { useState } from 'react'
import { Check, Undo2, X } from 'lucide-react'
import type { ReceivingWorkspace, SupplierItemCode } from '@/lib/receiving/types'
import { api, Button, Card, StatusBadge } from '@/components/ui'

/**
 * Remembered supplier Bill codes (RDTH Code / Material No. → Item Master), per Vendor.
 * Staff see the list; only Admin can approve, reject or revoke.
 */
export function SupplierCodesPanel({ data, isAdmin, onSaved, onError }: {
  data: ReceivingWorkspace
  isAdmin: boolean
  onSaved: (data: ReceivingWorkspace, text: string) => void
  onError: (text: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const pending = data.supplierCodes.filter((code) => code.status === 'pending')
  const approved = data.supplierCodes.filter((code) => code.status === 'approved')

  async function review(code: SupplierItemCode, action: 'approve' | 'reject' | 'revoke') {
    setBusyId(code.id)
    try {
      const result = await api<{ receiving: ReceivingWorkspace }>(`/api/receiving/supplier-codes/${code.id}`, { method: 'PATCH', body: JSON.stringify({ action }) })
      onSaved(result.receiving, action === 'approve' ? 'อนุมัติการจับคู่รหัสแล้ว' : action === 'reject' ? 'ไม่อนุมัติการจับคู่รหัสแล้ว' : 'ยกเลิกการจับคู่รหัสแล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  function row(code: SupplierItemCode) {
    const vendor = data.vendors.find((item) => item.id === code.vendorId)
    const item = data.items.find((candidate) => candidate.id === code.stockItemId)
    const busy = busyId === code.id
    return <li key={code.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-[#173d50]"><span className="mono">{code.codeRaw}</span> <span className="text-xs font-normal text-[#58747d]">({code.codeKind === 'rdth' ? 'RDTH Code' : 'Material No.'})</span> → {item ? `${item.catalogNo ? `REF ${item.catalogNo} · ` : ''}${item.name}` : 'สินค้าที่ปิดใช้งานแล้ว'}</p>
        <p className="text-xs text-[#81979c]">{vendor ? `${vendor.code} · ${vendor.name}` : code.vendorId}{code.descriptionText ? ` · ตาม Bill: ${code.descriptionText}` : ''}</p>
        <p className="text-xs text-[#81979c]">ขอโดย {code.requestedByName ?? '-'} · {code.requestedAt.slice(0, 10)}{code.status === 'approved' && code.reviewedByName ? ` · อนุมัติโดย ${code.reviewedByName}` : ''}</p>
      </div>
      {isAdmin ? <div className="flex flex-wrap gap-2">
        {code.status === 'pending' ? <>
          <Button type="button" disabled={busy} onClick={() => void review(code, 'approve')}><Check className="size-4" />อนุมัติ</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void review(code, 'reject')}><X className="size-4" />ไม่อนุมัติ</Button>
        </> : <Button type="button" variant="ghost" disabled={busy} onClick={() => void review(code, 'revoke')}><Undo2 className="size-4" />ยกเลิกการจับคู่</Button>}
      </div> : <StatusBadge tone={code.status === 'approved' ? 'accepted' : 'warning'} label={code.status === 'approved' ? 'ใช้งาน' : 'รออนุมัติ'} />}
    </li>
  }

  return <div className="space-y-4">
    <p className="text-sm text-[#58747d]">รหัสจาก Excel Bill ที่จับคู่กับ Item Master ไว้ — ระบบใช้เฉพาะรายการที่อนุมัติแล้วในการจับคู่อัตโนมัติ และแยกตาม Vendor</p>
    <Card className="overflow-hidden">
      <p className="border-b border-[#edf2f2] px-4 py-3 text-sm font-bold text-[#8f5f1d]">รออนุมัติ · {pending.length}</p>
      <ul className="divide-y divide-[#edf2f2]">{pending.map(row)}{!pending.length ? <li className="p-6 text-center text-sm text-[#81979c]">ไม่มีรายการรออนุมัติ</li> : null}</ul>
    </Card>
    <Card className="overflow-hidden">
      <p className="border-b border-[#edf2f2] px-4 py-3 text-sm font-bold text-[#173d50]">ใช้งานอยู่ · {approved.length}</p>
      <ul className="divide-y divide-[#edf2f2]">{approved.map(row)}{!approved.length ? <li className="p-6 text-center text-sm text-[#81979c]">ยังไม่มีรหัสที่จำไว้</li> : null}</ul>
    </Card>
  </div>
}
