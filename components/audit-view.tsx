'use client'

import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { api, Card, Loading } from '@/components/ui'
import { formatDateTime } from '@/lib/bm/rules'

type AuditLog = { id: number; actorName: string; action: string; entityType: string; entityId: string | null; detail: unknown; createdAt: string }

export function AuditPanel() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null)
  useEffect(() => {
    api<{ logs: AuditLog[] }>('/api/admin/audit').then((data) => setLogs(data.logs)).catch(() => setLogs([]))
  }, [])

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3"><ClipboardList className="size-4 text-[#0b7f76]" /><h2 className="font-bold">Recent audit logs</h2></div>
      {!logs ? <div className="p-6"><Loading /></div> : null}
      {logs ? <div className="divide-y divide-[#edf2f2]">{logs.map((log) => <div key={log.id} className="px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-[#315763]">{log.action}</p><p className="mt-0.5 text-xs text-[#81979c]">{log.entityType}{log.entityId ? ` · ${log.entityId}` : ''}</p></div><p className="text-right text-xs text-[#81979c]">{formatDateTime(log.createdAt)}<br />{log.actorName}</p></div><pre className="mono mt-2 max-h-24 overflow-auto rounded bg-[#f6fafa] p-2 text-[10px] text-[#55727c]">{JSON.stringify(log.detail, null, 2)}</pre></div>)}{!logs.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">No audit logs</p> : null}</div> : null}
    </Card>
  )
}
