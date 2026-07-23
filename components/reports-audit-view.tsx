'use client'

import { useState } from 'react'
import { AlertOctagon, ArrowRight, BarChart3, ClipboardList } from 'lucide-react'
import type { StockWorkspace } from '@/lib/bm/types'
import { PageHeader } from '@/components/ui'
import { ReportsPanel, StockAlertsPanel } from '@/components/reports-view'
import { AuditPanel } from '@/components/audit-view'
import { StockModuleShell } from '@/components/stock-module-shell'

type Tab = 'reports' | 'alerts' | 'audit'

const TABS: { tab: Tab; label: string; detail: string; icon: typeof BarChart3 }[] = [
  { tab: 'reports', label: 'Reports', detail: 'Export & snapshot', icon: BarChart3 },
  { tab: 'alerts', label: 'Attention', detail: 'Low stock & expiry', icon: AlertOctagon },
  { tab: 'audit', label: 'Audit trail', detail: 'Traceability', icon: ClipboardList },
]

export function ReportsAuditView({ stock }: { stock: StockWorkspace }) {
  const [tab, setTab] = useState<Tab>('reports')
  const attentionCount = stock.lowStockItemCount + stock.expiringLotCount + stock.expiredLotCount

  return (
    <StockModuleShell className="space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="Reports / audit trail"
        title="รายงานและ Audit"
        description="ศูนย์รวมสำหรับตรวจสอบสถานะคลัง ส่งออกรายงาน และตามรอยการเปลี่ยนแปลง"
      />

      <section className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Stock summary">
        <ReportMetric label="Active items" value={stock.activeItemCount} detail="พร้อมติดตาม" />
        <ReportMetric label="Needs attention" value={attentionCount} detail="low / expiry" tone={attentionCount ? 'warning' : 'ok'} />
        <ReportMetric label="Locations" value={stock.locationCount} detail="active storage" />
      </section>

      <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Reports and audit views">
        {TABS.map(({ tab: tabKey, label, detail, icon: Icon }) => {
          const active = tab === tabKey
          const count = tabKey === 'alerts' ? attentionCount : undefined
          return (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tabKey)}
              className={`group flex min-h-16 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${active ? 'border-[#0b7f76] bg-[#f1faf9] shadow-[0_8px_20px_rgba(20,64,72,0.08)]' : 'border-[#d6e2e3] bg-white/80 text-[#58747d] hover:border-[#a9cdca] hover:bg-white'}`}
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-[#0b7f76] text-white' : 'bg-[#eef6f5] text-[#0b7f76]'}`}><Icon className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-bold ${active ? 'text-[#173d50]' : 'text-[#315763]'}`}>{label}</span>
                <span className="mt-0.5 block text-[11px] text-[#789097]">{detail}</span>
              </span>
              {count !== undefined ? <span className={`mono rounded-full px-2 py-1 text-xs font-bold ${count ? 'bg-[#fff1e8] text-[#a76511]' : 'bg-[#eef8f5] text-[#0b7f76]'}`}>{count}</span> : <ArrowRight className={`size-4 transition ${active ? 'text-[#0b7f76]' : 'text-[#a4b7ba] group-hover:translate-x-0.5'}`} />}
            </button>
          )
        })}
      </div>

      <div className="min-h-[28rem]">
        {tab === 'reports' ? <ReportsPanel stock={stock} /> : null}
        {tab === 'alerts' ? <StockAlertsPanel stock={stock} /> : null}
        {tab === 'audit' ? <AuditPanel /> : null}
      </div>
    </StockModuleShell>
  )
}

function ReportMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: number; detail: string; tone?: 'neutral' | 'ok' | 'warning' }) {
  const colors = {
    neutral: 'border-[#d6e2e3] bg-white text-[#173d50]',
    ok: 'border-[#c9e2d8] bg-[#f4fbf8] text-[#08766e]',
    warning: 'border-[#eed9a8] bg-[#fffaf0] text-[#9a6515]',
  }[tone]
  return <div className={`rounded-xl border px-3 py-3 shadow-[0_8px_20px_rgba(20,64,72,0.04)] ${colors}`}><p className="text-[9px] font-bold tracking-[0.12em] uppercase opacity-70 sm:text-[10px]">{label}</p><p className="mono mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p><p className="mt-0.5 text-[10px] opacity-70 sm:text-[11px]">{detail}</p></div>
}
