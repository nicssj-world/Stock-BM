'use client'

import { useState } from 'react'
import { AlertOctagon, BarChart3, ClipboardList } from 'lucide-react'
import type { StockWorkspace } from '@/lib/bm/types'
import { PageHeader } from '@/components/ui'
import { ReportsPanel, StockAlertsPanel } from '@/components/reports-view'
import { AuditPanel } from '@/components/audit-view'
import { StockMetric, StockMetricStrip, StockModuleShell } from '@/components/stock-module-shell'

type Tab = 'reports' | 'alerts' | 'audit'

const TABS: { tab: Tab; label: string; icon: typeof BarChart3 }[] = [
  { tab: 'reports', label: 'รายงาน / Reports', icon: BarChart3 },
  { tab: 'alerts', label: 'Alerts', icon: AlertOctagon },
  { tab: 'audit', label: 'Audit log', icon: ClipboardList },
]

export function ReportsAuditView({ stock }: { stock: StockWorkspace }) {
  const [tab, setTab] = useState<Tab>('reports')
  return (
    <StockModuleShell>
      <PageHeader eyebrow="Reports / audit trail" title="รายงาน / Reports & Audit" description="ดูสถานะที่ต้องดำเนินการ, export รายงาน และตรวจสอบประวัติอย่างเป็นระบบ" />
      <StockMetricStrip>
        <StockMetric label="Items" value={stock.activeItemCount} detail="รายการเปิดใช้งาน" />
        <StockMetric label="Low" value={stock.lowStockItemCount} detail="ต่ำกว่าขั้นต่ำ" tone={stock.lowStockItemCount ? 'danger' : 'ok'} />
        <StockMetric label="Expiring" value={stock.expiringLotCount} detail="ใกล้หมดอายุ" tone={stock.expiringLotCount ? 'warning' : 'ok'} />
        <StockMetric label="Expired" value={stock.expiredLotCount} detail="ต้องติดตามทันที" tone={stock.expiredLotCount ? 'danger' : 'ok'} />
      </StockMetricStrip>
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[#d6e2e3] bg-white p-1.5 shadow-[0_6px_16px_rgba(20,64,72,0.04)]" role="tablist" aria-label="มุมมองรายงาน">
        {TABS.map(({ tab: tabKey, label, icon: Icon }) => {
          const active = tab === tabKey
          return (
            <button
              key={tabKey}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tabKey)}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${active ? 'bg-[#0b7f76] text-white' : 'text-[#58747d] hover:bg-[#eef6f5]'}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          )
        })}
      </div>
      {tab === 'reports' ? <ReportsPanel stock={stock} /> : null}
      {tab === 'alerts' ? <StockAlertsPanel stock={stock} /> : null}
      {tab === 'audit' ? <AuditPanel /> : null}
    </StockModuleShell>
  )
}
