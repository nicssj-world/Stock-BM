'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, BarChart3, Boxes, ClipboardCheck, Dna, GitCompareArrows, LineChart, LogOut, MoveRight, QrCode, Settings, ShieldCheck, Thermometer } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import { api } from '@/components/ui'

type NavItem = { href: string; label: string; icon: typeof Activity }
type NavSection = { title: string; items: NavItem[] }

const homeSection: NavSection = {
  title: 'หน้าหลัก',
  items: [
    { href: '/dashboard', label: 'หน้าหลัก / Home', icon: Activity },
  ],
}

const stockSection: NavSection = {
  title: 'Stock',
  items: [
    { href: '/inventory', label: 'คลัง / Inventory', icon: Boxes },
    { href: '/movements', label: 'รับ-จ่าย / Movements', icon: MoveRight },
    { href: '/scan', label: 'สแกน / Scan', icon: QrCode },
    { href: '/reports', label: 'รายงาน / Reports & Audit', icon: BarChart3 },
  ],
}

const hpvSection: NavSection = {
  title: 'HPV',
  items: [
    { href: '/hpv', label: 'HPV Management', icon: Dna },
  ],
}

const qualitySection: NavSection = {
  title: 'Quality',
  items: [
    { href: '/iqc', label: 'IQC', icon: LineChart },
    { href: '/eqa', label: 'EQA', icon: ClipboardCheck },
  ],
}

const monitoringSection: NavSection = {
  title: 'Monitoring',
  items: [
    { href: '/environment', label: 'อุณหภูมิ / Temperature', icon: Thermometer },
    { href: '/lot-verification', label: 'Lot verification', icon: GitCompareArrows },
  ],
}

export function AppShell({ actor, children }: { actor: BmActor; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const sections: NavSection[] = [homeSection, stockSection, hpvSection, qualitySection, monitoringSection]
  if (actor.role === 'Admin') sections.push({ title: 'System', items: [{ href: '/admin', label: 'Admin', icon: Settings }] })

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="bg-[#123944] text-white lg:min-h-screen">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:block lg:px-5 lg:py-6">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#7ee3d8] uppercase">Chonburi Hospital</p>
            <h1 className="mt-1 text-xl leading-tight font-bold">Molecular-CBH QMS</h1>
            <p className="mt-1 hidden text-xs text-[#a8c8ce] lg:block">Quality Management System</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <span className="rounded border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-bold text-[#cce7eb]">{actor.role}</span>
            <button
              type="button"
              onClick={logout}
              aria-label="ออกจากระบบ / Logout"
              title="ออกจากระบบ / Logout"
              className="inline-flex size-9 items-center justify-center rounded-md border border-white/15 bg-white/10 text-[#cce7eb] transition hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-[#7ee3d8] focus-visible:outline-none"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible lg:px-3">
          {sections.map((section) => (
            <div key={section.title} className="contents lg:block">
              <p className="hidden px-3 pt-4 pb-1 text-[10px] font-bold tracking-[0.16em] text-[#5f939b] uppercase lg:block">{section.title}</p>
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[#7ee3d8] focus-visible:outline-none lg:w-full ${active ? 'bg-[#0b7f76] text-white' : 'text-[#b9d6dc] hover:bg-white/8 hover:text-white'}`}
                  >
                    <Icon className="size-4" />
                    <span className="whitespace-nowrap">{label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <p className="font-bold text-white">{actor.displayName}</p>
            <p className="mt-1 text-[11px] text-[#a8c8ce]">{actor.role} · E-Phis {actor.ephisId}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[#7ee3d8]"><ShieldCheck className="size-3" /> Linked Genomic-CBH</p>
          </div>
          <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-[#b9d6dc] hover:bg-white/8 hover:text-white">
            <LogOut className="size-4" /> ออกจากระบบ / Logout
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-7">{children}</main>
    </div>
  )
}

