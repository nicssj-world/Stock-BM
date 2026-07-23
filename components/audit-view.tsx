'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ClipboardList } from 'lucide-react'
import { api, Card, Loading } from '@/components/ui'
import { formatDateTime } from '@/lib/bm/rules'

type AuditLog = { id: number; actorName: string; action: string; entityType: string; entityId: string | null; detail: unknown; createdAt: string }

export function AuditPanel() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  useEffect(() => {
    api<{ logs: AuditLog[] }>('/api/admin/audit').then((data) => setLogs(data.logs)).catch(() => setLogs([]))
  }, [])

  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-3 border-b border-[#e1eaeb] bg-[#f8fcfb] px-4 py-3"><div className="flex items-center gap-2"><ClipboardList className="size-4 text-[#0b7f76]" /><div><p className="text-[10px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Traceability</p><h2 className="font-bold">Recent audit logs</h2></div></div><span className="text-xs text-[#789097]">กดเพื่อดูรายละเอียด</span></div>
      {!logs ? <div className="p-6"><Loading /></div> : null}
      {logs ? <div className="divide-y divide-[#edf2f2]">{logs.map((log) => {
        const open = openId === log.id
        return <div key={log.id} className={`px-4 py-3 transition ${open ? 'bg-[#fbfefd]' : 'hover:bg-[#f8fcfb]'}`}><button type="button" onClick={() => setOpenId(open ? null : log.id)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 text-left focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none"><div><p className="font-bold text-[#315763]">{log.action}</p><p className="mt-0.5 text-xs text-[#81979c]">{log.entityType}{log.entityId ? ` · ${log.entityId}` : ''}</p></div><div className="flex items-start gap-2"><p className="text-right text-xs text-[#81979c]">{formatDateTime(log.createdAt)}<br />{log.actorName}</p><ChevronDown className={`mt-1 size-4 text-[#789097] transition ${open ? 'rotate-180' : ''}`} /></div></button>{open ? <pre className="mono mt-3 max-h-48 overflow-auto rounded-lg border border-[#dce9e8] bg-[#f3f9f8] p-3 text-[10px] text-[#55727c]">{JSON.stringify(log.detail, null, 2)}</pre> : null}</div>
      })}{!logs.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">No audit logs</p> : null}</div> : null}
    </Card>
  )
}
