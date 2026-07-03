'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, LoaderCircle, ScanLine, TriangleAlert } from 'lucide-react'
import type { LotIssueContext, QuickIssueResult } from '@/lib/bm/types'
import { formatDate, formatQuantity } from '@/lib/bm/rules'
import { api, Button, Card, Notice, PageHeader } from '@/components/ui'

export function QuickIssue({ context }: { context: LotIssueContext }) {
  const startedRef = useRef(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<QuickIssueResult | null>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    async function issue() {
      setBusy(true)
      setError('')
      try {
        const response = await api<{ result: QuickIssueResult }>('/api/stock/issues/quick', {
          method: 'POST',
          body: JSON.stringify({ code: context.lotToken }),
        })
        setResult(response.result)
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'ตัด stock ไม่สำเร็จ')
      } finally {
        setBusy(false)
      }
    }
    void issue()
  }, [context.lotToken])

  return (
    <div className="mx-auto max-w-md space-y-4 pb-4">
      <Link href="/scan" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ScanLine className="size-4" /> สแกนใหม่</Link>
      <PageHeader eyebrow="QR scan issue" title={context.itemName} description={`${context.itemCode} · LOT ${context.lotNumber} · EXP ${formatDate(context.expiryDate)}`} />

      <Card className="p-5 text-center">
        {busy ? (
          <div className="py-8">
            <LoaderCircle className="mx-auto size-10 animate-spin text-[#0b7f76]" />
            <h2 className="mt-4 text-lg font-bold text-[#173d50]">กำลังตัด stock</h2>
            <p className="mt-1 text-sm text-[#789097]">ระบบใช้จำนวน default ของ item นี้โดยอัตโนมัติ</p>
          </div>
        ) : result ? (
          <div className="py-6">
            <CheckCircle2 className="mx-auto size-12 text-[#0b7f76]" />
            <h2 className="mt-4 text-xl font-bold text-[#173d50]">ตัด stock แล้ว</h2>
            <p className="mono mt-2 text-sm font-bold text-[#315763]">{result.itemCode} · LOT {result.lotNumber}</p>
            <p className="mt-1 text-sm text-[#789097]">{formatQuantity(result.quantity)} {result.unit} จาก {result.locationCode}</p>
          </div>
        ) : (
          <div className="py-6">
            <TriangleAlert className="mx-auto size-12 text-[#be3d49]" />
            <h2 className="mt-4 text-xl font-bold text-[#173d50]">ตัด stock ไม่สำเร็จ</h2>
            <div className="mt-4 text-left"><Notice tone="danger">{error}</Notice></div>
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href="/scan"><Button className="h-12 w-full"><ScanLine className="size-4" /> สแกนต่อ</Button></Link>
          <Link href="/inventory"><Button variant="secondary" className="h-12 w-full">ไปคลัง</Button></Link>
        </div>
      </Card>
    </div>
  )
}
