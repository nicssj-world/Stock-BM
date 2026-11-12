'use client'

import { useEffect, useState } from 'react'
import { api, Button, Input, Notice } from '@/components/ui'
import type { PortalEquipmentModule, PortalEquipmentReference } from '@/lib/equipment/portal-reference-types'

export function PortalEquipmentLinker({
  module, entityId, initialIds = [], onSaved,
}: {
  module: PortalEquipmentModule
  entityId: string
  initialIds?: string[]
  onSaved?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [refs, setRefs] = useState<PortalEquipmentReference[]>([])
  const [selected, setSelected] = useState<string[]>(initialIds)
  const [term, setTerm] = useState('')
  const [labCode, setLabCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null)

  useEffect(() => {
    if (!expanded) return
    let alive = true
    api<{ equipment: PortalEquipmentReference[] }>('/api/portal-equipment')
      .then((result) => { if (alive) setRefs(result.equipment) })
      .catch((error) => { if (alive) setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'โหลดเครื่องมือไม่สำเร็จ' }) })
    return () => { alive = false }
  }, [expanded])

  async function lookup() {
    if (!labCode.trim()) return
    setBusy(true); setMessage(null)
    try {
      const result = await api<{ equipment: PortalEquipmentReference }>('/api/portal-equipment', {
        method: 'POST', body: JSON.stringify({ labCode }),
      })
      setRefs((current) => [...current.filter((row) => row.id !== result.equipment.id), result.equipment].sort((a, b) => a.code.localeCompare(b.code)))
      setTerm(result.equipment.code)
      setLabCode('')
      setMessage({ tone: 'success', text: 'ดึงข้อมูลอ้างอิงจาก Portal แล้ว กรุณาเลือกและบันทึกการเชื่อมโยง' })
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'ไม่สามารถค้นหาใน Portal ได้' })
    } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setMessage(null)
    try {
      await api('/api/portal-equipment/links', {
        method: 'PUT', body: JSON.stringify({ module, entityId, equipmentIds: selected }),
      })
      setMessage({ tone: 'success', text: 'บันทึกการเชื่อมโยงเรียบร้อยแล้ว' })
      onSaved?.()
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกการเชื่อมโยงไม่สำเร็จ' })
    } finally { setBusy(false) }
  }
  const visible = refs.filter((row) => `${row.code} ${row.name} ${row.model ?? ''} ${row.serialNumber ?? ''}`.toLowerCase().includes(term.toLowerCase().trim()))
  return (
    <div className="rounded-md border border-[#d8e6e7] bg-[#f9fcfc] p-3">
      <Button type="button" variant="secondary" className="text-xs" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'ซ่อนการเชื่อมเครื่องมือ' : 'เลือกเครื่องมือจาก Portal'}
      </Button>
      {expanded ? <div className="mt-3 space-y-3">
        <p className="text-xs text-[#58747d]">ทะเบียนเครื่องมืออยู่ที่ Portal · ที่นี่บันทึกเฉพาะการเชื่อมโยงกับโมดูลนี้</p>
        <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="ค้นหารหัส LAB / ชื่อเครื่องมือ / รุ่น / Serial Number" />
        <div className="max-h-56 space-y-1 overflow-auto rounded-md border bg-white p-2">
          {visible.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded p-2 text-xs hover:bg-[#f1f7f7]">
            <input type={module === 'iqc' ? 'radio' : 'checkbox'} className="mt-0.5 size-4" name={module === 'iqc' ? `portal-eq-${entityId}` : undefined}
              disabled={item.status === 'decommissioned' && !selected.includes(item.id)}
              checked={selected.includes(item.id)}
              onChange={(event) => setSelected(module === 'iqc' ? [item.id] : event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} />
            <span className="min-w-0 flex-1"><strong>{item.code}</strong> · {item.name}{item.model ? ` · ${item.model}` : ''}{item.serialNumber ? ` · S/N ${item.serialNumber}` : ''}<span className="ml-1 text-[#6c838a]">({item.status})</span>{item.portalUrl ? <a href={item.portalUrl} target="_blank" rel="noreferrer" className="ml-2 font-semibold text-[#0b7f76] underline" onClick={(event) => event.stopPropagation()}>เปิดใน Portal</a> : null}</span>
          </label>)}
          {!visible.length ? <p className="p-2 text-xs text-[#789097]">ไม่พบเครื่องมือ · ค้นจาก Portal ด้วยรหัส LAB ด้านล่าง</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-44 flex-1" value={labCode} onChange={(event) => setLabCode(event.target.value)} placeholder="LAB-BM-..." />
          <Button type="button" variant="secondary" disabled={busy || !labCode.trim()} onClick={lookup}>ค้นจาก Portal</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" disabled={busy} onClick={save}>บันทึกเครื่องมือ ({selected.length})</Button>
          {module === 'iqc' && selected.length ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setSelected([])}>ยกเลิกการเลือก</Button> : null}
        </div>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </div> : null}
    </div>
  )
}
