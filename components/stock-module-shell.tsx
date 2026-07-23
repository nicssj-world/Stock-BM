'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Boxes, ClipboardList, QrCode } from 'lucide-react'
import type { ReactNode } from 'react'

const STOCK_NAV = [
  { href: '/inventory', label: 'คลัง', detail: 'Inventory', icon: Boxes },
  { href: '/movements', label: 'รับ-จ่าย', detail: 'Movements', icon: ClipboardList },
  { href: '/scan', label: 'สแกน', detail: 'Scan', icon: QrCode },
  { href: '/reports', label: 'รายงาน', detail: 'Reports', icon: BarChart3 },
]

export function StockModuleShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  const pathname = usePathname()
  return (
    <div className={`stock-command mx-auto max-w-[1520px] space-y-5 ${className}`}>
      <nav className="no-print -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-[#cfe0df] bg-white/75 p-1.5 shadow-[0_8px_25px_rgba(20,64,72,0.05)] backdrop-blur" aria-label="เมนูคลัง">
        {STOCK_NAV.map(({ href, label, detail, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`group flex min-h-11 min-w-32 flex-1 items-center gap-2 rounded-lg px-3 py-2 transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none sm:min-w-36 ${active ? 'bg-[#123944] text-white shadow-sm' : 'text-[#537078] hover:bg-[#edf7f5] hover:text-[#123944]'}`}
            >
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-white/12 text-[#8ce8df]' : 'bg-[#edf6f5] text-[#0b7f76] group-hover:bg-white'}`}><Icon className="size-4" /></span>
              <span className="min-w-0 leading-tight"><span className="block text-sm font-bold">{label}</span><span className={`block text-[10px] font-medium ${active ? 'text-[#addbd8]' : 'text-[#8ca3a6]'}`}>{detail}</span></span>
            </Link>
          )
        })}
      </nav>
      {children}
    </div>
  )
}

export function StockMetricStrip({ children }: { children: ReactNode }) {
  return <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">{children}</section>
}

export function StockMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: ReactNode; detail: string; tone?: 'neutral' | 'ok' | 'warning' | 'danger' }) {
  const toneClass = {
    neutral: 'border-[#d7e5e5] bg-white text-[#173d50]',
    ok: 'border-[#c9e2d8] bg-[#f4fbf8] text-[#08766e]',
    warning: 'border-[#eed9a8] bg-[#fffaf0] text-[#9a6515]',
    danger: 'border-[#efcdd1] bg-[#fff7f7] text-[#b33b46]',
  }[tone]
  return (
    <div className={`relative overflow-hidden rounded-xl border px-3 py-3 shadow-[0_8px_22px_rgba(20,64,72,0.04)] ${toneClass}`}>
      <div className="absolute inset-y-0 left-0 w-1 bg-current opacity-70" />
      <p className="pl-2 text-[10px] font-bold tracking-[0.14em] uppercase opacity-70">{label}</p>
      <p className="mono mt-1 pl-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 pl-2 text-[11px] opacity-70">{detail}</p>
    </div>
  )
}

export function StockPanelTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e4eeee] px-4 py-3">
      <div>
        {eyebrow ? <p className="text-[10px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">{eyebrow}</p> : null}
        <h2 className="mt-0.5 font-bold text-[#173d50]">{title}</h2>
      </div>
      {action}
    </div>
  )
}
