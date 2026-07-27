'use client'

import { useState } from 'react'
import { missingPlannedRounds } from '@/lib/eqa/rules'
import type { EqaPlanItem, EqaRound, EqaWorkspace } from '@/lib/eqa/types'
import { api, Button } from '@/components/ui'

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function GeneratePlannedRoundsButton({ item, planYear, itemRounds, onOk, onErr }: {
  item: EqaPlanItem
  planYear: number
  itemRounds: EqaRound[]
  onOk: (text: string, data: EqaWorkspace) => void
  onErr: (text: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const missing = missingPlannedRounds(item, itemRounds.length, planYear)
  if (!missing.length) return null

  async function generate() {
    const months = missing.map((round) => THAI_MONTHS[round.plannedMonth - 1]).join(', ')
    if (!window.confirm(`สร้าง round ที่ยังขาด ${missing.length} รายการ (${months}) ใช่ไหม?`)) return
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/plan-items/${item.id}/rounds`, { method: 'POST', body: '{}' })
      onOk(`สร้าง round แล้ว ${missing.length} รายการ`, result.eqa)
    } catch (error) {
      onErr(error instanceof Error ? error.message : 'สร้าง round ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="secondary" className="min-h-8 px-2.5 py-1 text-xs" disabled={busy} onClick={generate}>
      สร้าง round ที่ยังขาดจากแผน ({missing.length})
    </Button>
  )
}
