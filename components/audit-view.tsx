'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ClipboardList, Database, Filter, Search, UserRound } from 'lucide-react'
import { api, Button, Card, Input, Loading, Select } from '@/components/ui'
import { formatDateTime } from '@/lib/bm/rules'

type AuditLog = { id: number; actorName: string; action: string; entityType: string; entityId: string | null; detail: unknown; createdAt: string }

function actionLabel(action: string) {
  return action.split('.').map((part) => part.replace(/([a-z])([A-Z])/g, '$1 $2')).join(' › ')
}

function detailValue(value: unknown) {
  if (value === null) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  try { return JSON.stringify(value) } catch { return '—' }
}

function detailEntries(detail: unknown) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return []
  return Object.entries(detail as Record<string, unknown>).slice(0, 6)
}

export function AuditPanel() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null)
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(16)

  useEffect(() => {
    api<{ logs: AuditLog[] }>('/api/admin/audit').then((data) => setLogs(data.logs)).catch(() => setLogs([]))
  }, [])

  const actions = useMemo(() => [...new Set((logs ?? []).map((log) => log.action))].sort(), [logs])
  const filteredLogs = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (logs ?? []).filter((log) => {
      const matchesAction = actionFilter === 'all' || log.action === actionFilter
      const searchable = `${log.action} ${log.entityType} ${log.entityId ?? ''} ${log.actorName}`.toLowerCase()
      return matchesAction && (!term || searchable.includes(term))
    })
  }, [logs, query, actionFilter])
  const shownLogs = filteredLogs.slice(0, visibleCount)
  const selected = filteredLogs.find((log) => log.id === selectedId) ?? null
  const uniqueActors = new Set((logs ?? []).map((log) => log.actorName)).size

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-4 border-b border-[#e2eceb] bg-[#f8fcfb] px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">Traceability desk</p>
            <h2 className="mt-1 font-bold text-[#173d50]">Audit trail</h2>
            <p className="mt-0.5 text-xs text-[#789097]">เลือก event เพื่ออ่านสรุปก่อนเปิดข้อมูลดิบ</p>
          </div>
          {logs ? <div className="flex flex-wrap gap-2"><AuditStat label="Events" value={logs.length} icon={<ClipboardList />} /><AuditStat label="Actors" value={uniqueActors} icon={<UserRound />} /></div> : null}
        </div>
        <div className="flex flex-col gap-2 border-b border-[#e8f0ef] px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1"><Search className="absolute top-2.5 left-3 size-4 text-[#8ca1a5]" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(16) }} className="pl-9" placeholder="ค้นหา action, user หรือ entity" aria-label="Search audit logs" /></div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#617c84]"><Filter className="size-3.5" /><span className="sr-only">Filter action</span><Select value={actionFilter} onChange={(event) => { setActionFilter(event.target.value); setVisibleCount(16) }} className="min-w-48"><option value="all">ทุก action</option>{actions.map((action) => <option key={action} value={action}>{action}</option>)}</Select></label>
        </div>

        {!logs ? <div className="p-7"><Loading /></div> : null}
        {logs ? <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(21rem,.65fr)]">
          <section aria-label="Audit events" className="min-w-0 border-b border-[#e8f0ef] xl:max-h-[38rem] xl:overflow-y-auto xl:border-r xl:border-b-0">
            <div className="flex items-center justify-between bg-[#fbfdfd] px-4 py-2.5 text-xs text-[#789097] sm:px-5"><span><b className="text-[#315763]">{filteredLogs.length}</b> matching events</span><span>ล่าสุดก่อน</span></div>
            <div className="divide-y divide-[#edf2f2]">
              {shownLogs.map((log) => <AuditRow key={log.id} log={log} selected={selectedId === log.id} onSelect={() => setSelectedId(log.id)} />)}
              {!shownLogs.length ? <p className="px-4 py-12 text-center text-sm text-[#91a4a9]">ไม่พบ audit event ที่ตรงกับเงื่อนไข</p> : null}
            </div>
            {shownLogs.length < filteredLogs.length ? <div className="p-3 text-center"><Button variant="secondary" onClick={() => setVisibleCount((count) => count + 16)}>แสดงเพิ่ม ({filteredLogs.length - shownLogs.length})</Button></div> : null}
          </section>
          <AuditDetail log={selected} />
        </div> : null}
      </Card>
    </div>
  )
}

function AuditStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="flex items-center gap-2 rounded-lg border border-[#d7e6e4] bg-white px-2.5 py-1.5"><span className="text-[#0b7f76] [&>svg]:size-3.5">{icon}</span><span><span className="mono text-xs font-bold text-[#173d50]">{value}</span><span className="ml-1 text-[10px] font-bold tracking-[0.08em] text-[#789097] uppercase">{label}</span></span></div>
}

function AuditRow({ log, selected, onSelect }: { log: AuditLog; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b7f76] focus-visible:outline-none sm:px-5 ${selected ? 'bg-[#eef8f6]' : 'hover:bg-[#f8fcfb]'}`}><span className={`mt-1.5 size-2 shrink-0 rounded-full ${selected ? 'bg-[#0b7f76] ring-4 ring-[#cceae5]' : 'bg-[#c4d2d4]'}`} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><b className="text-sm text-[#315763]">{actionLabel(log.action)}</b><span className="mono text-[10px] text-[#91a3a7]">#{log.id}</span></span><span className="mt-1 block truncate text-xs text-[#789097]">{log.entityType}{log.entityId ? ` · ${log.entityId}` : ''}</span></span><span className="shrink-0 text-right text-[11px] leading-5 text-[#789097]"><span className="block">{formatDateTime(log.createdAt)}</span><span className="font-semibold text-[#55727c]">{log.actorName}</span></span></button>
}

function AuditDetail({ log }: { log: AuditLog | null }) {
  if (!log) return <aside className="flex min-h-72 flex-col items-center justify-center bg-[#fbfdfd] px-6 text-center xl:sticky xl:top-4 xl:self-start"><span className="flex size-10 items-center justify-center rounded-full bg-[#e8f4f2] text-[#0b7f76]"><Database className="size-5" /></span><h3 className="mt-3 text-sm font-bold text-[#315763]">เลือก event เพื่อดูรายละเอียด</h3><p className="mt-1 max-w-xs text-xs leading-5 text-[#789097]">สรุปข้อมูลจะแสดงที่นี่ โดย JSON ดิบยังซ่อนไว้จนกว่าจะเปิดดู</p></aside>
  const entries = detailEntries(log.detail)
  return <aside className="bg-[#fbfdfd] px-4 py-4 sm:px-5 xl:sticky xl:top-4 xl:self-start"><p className="text-[10px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">Selected event</p><h3 className="mt-1 break-words font-bold text-[#173d50]">{actionLabel(log.action)}</h3><p className="mt-1 text-xs text-[#789097]">{formatDateTime(log.createdAt)} · {log.actorName}</p><dl className="mt-4 divide-y divide-[#e6efee] rounded-lg border border-[#e1eceb] bg-white px-3"><DetailLine label="Entity" value={log.entityType} /><DetailLine label="Record" value={log.entityId ?? '—'} /><DetailLine label="Actor" value={log.actorName} /></dl>{entries.length ? <div className="mt-4"><p className="text-[10px] font-bold tracking-[0.14em] text-[#789097] uppercase">Change summary</p><dl className="mt-2 divide-y divide-[#e6efee] rounded-lg border border-[#e1eceb] bg-white px-3">{entries.map(([key, value]) => <DetailLine key={key} label={key} value={detailValue(value)} />)}</dl></div> : <p className="mt-4 rounded-lg border border-dashed border-[#d6e3e2] px-3 py-3 text-xs text-[#789097]">ไม่มีรายละเอียดเพิ่มเติมสำหรับ event นี้</p>}<details className="mt-4 group"><summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-[#d7e4e3] bg-white px-3 py-2.5 text-xs font-bold text-[#55727c] transition hover:bg-[#f5faf9]">Raw JSON<ChevronDown className="size-4 transition group-open:rotate-180" /></summary><pre className="mono mt-2 max-h-56 overflow-auto rounded-lg border border-[#dce9e8] bg-[#f3f9f8] p-3 text-[10px] leading-5 text-[#55727c]">{JSON.stringify(log.detail, null, 2)}</pre></details></aside>
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-2.5 text-xs"><dt className="font-semibold text-[#789097]">{label}</dt><dd className="break-words text-right text-[#315763]">{value}</dd></div>
}
