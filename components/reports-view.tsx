'use client'

import { BarChart3, FileDown, FileText } from 'lucide-react'
import type { StockWorkspace } from '@/lib/bm/types'
import { Card, Button } from '@/components/ui'

export function ReportsPanel({ stock }: { stock: StockWorkspace }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ReportCard title="Balances CSV" detail={`${stock.items.length} items`} href="/api/stock/export?report=balances" icon={<FileDown />} />
      <ReportCard title="Movement CSV" detail={`${stock.transactions.length} transactions`} href="/api/stock/export?report=movements" icon={<BarChart3 />} />
      <ReportCard title="Summary PDF" detail="Low stock / expiry summary" href="/api/reports/stock-summary.pdf" icon={<FileText />} />
    </div>
  )
}

function ReportCard({ title, detail, href, icon }: { title: string; detail: string; href: string; icon: React.ReactNode }) {
  return <Card className="p-4"><div className="flex size-10 items-center justify-center rounded-md bg-[#e8f7f5] text-[#0b7f76] [&>svg]:size-5">{icon}</div><h2 className="mt-4 font-bold text-[#173d50]">{title}</h2><p className="mt-1 text-sm text-[#789097]">{detail}</p><Button className="mt-5 w-full" onClick={() => { window.location.href = href }}>Download</Button></Card>
}
