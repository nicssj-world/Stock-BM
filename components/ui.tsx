import type { ReactNode } from 'react'
import { AlertTriangle, CircleAlert, CheckCircle2, LoaderCircle, Minus, XCircle } from 'lucide-react'

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const variants = {
    primary: 'bg-[#0b7f76] text-white hover:bg-[#096b64] shadow-sm',
    secondary: 'border border-[#c9dadd] bg-white text-[#244854] hover:border-[#7fa9ad] hover:bg-[#f7fbfb]',
    ghost: 'text-[#55727c] hover:bg-[#eef5f4] hover:text-[#244854]',
    danger: 'border border-[#edc7cb] bg-[#fff7f7] text-[#af3541] hover:bg-[#ffebed]',
  }
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 min-w-0 max-w-full w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition placeholder:text-[#9aafb4] focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-11 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10 ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-11 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition placeholder:text-[#9aafb4] focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10 ${className}`}
      {...props}
    />
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#58747d]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-[#8ba0a5]">{hint}</span> : null}
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`paper rounded-lg ${className}`}>{children}</section>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-bold tracking-[0.18em] text-[#0b7f76] uppercase">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-[#173d50] sm:text-3xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6a838c]">{description}</p>
      </div>
      {actions}
    </header>
  )
}

export function Loading({ label = 'กำลังโหลด / Loading' }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-sm text-[#6c858d]"><LoaderCircle className="size-4 animate-spin" />{label}</span>
}

export function Notice({ children, tone = 'info', onDismiss }: { children: ReactNode; tone?: 'info' | 'warning' | 'danger' | 'success'; onDismiss?: () => void }) {
  const styles = {
    info: 'border-[#bddedc] bg-[#f1faf9] text-[#176b68]',
    warning: 'border-[#eed4a6] bg-[#fff9ed] text-[#99601b]',
    danger: 'border-[#efc7cc] bg-[#fff5f6] text-[#a83541]',
    success: 'border-[#c6e2ca] bg-[#f3faf4] text-[#4b7b51]',
  }
  // Errors and confirmations are announced to screen readers when they appear.
  const role = tone === 'danger' ? 'alert' : tone === 'success' ? 'status' : undefined
  return (
    <div role={role} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${styles[tone]}`}>
      {tone === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? <button type="button" onClick={onDismiss} aria-label="ปิดข้อความ" className="-my-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none"><XCircle className="size-4" aria-hidden="true" /></button> : null}
    </div>
  )
}

export type StatusTone = 'accepted' | 'warning' | 'investigate' | 'rejected' | 'not_evaluated' | 'neutral'

// Status is always conveyed with icon + text + colour (never colour alone).
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const map = {
    accepted: { cls: 'border-[#c6e2ca] bg-[#f1faf3] text-[#2f7d44]', Icon: CheckCircle2 },
    warning: { cls: 'border-[#eed4a6] bg-[#fff9ed] text-[#a9700f]', Icon: AlertTriangle },
    investigate: { cls: 'border-[#e6d3b5] bg-[#fff8ee] text-[#8f5f1d]', Icon: CircleAlert },
    rejected: { cls: 'border-[#efc7cc] bg-[#fff5f6] text-[#c02a37]', Icon: XCircle },
    not_evaluated: { cls: 'border-[#d2dee0] bg-[#f6f9f9] text-[#5b7681]', Icon: Minus },
    neutral: { cls: 'border-[#d2dee0] bg-[#f6f9f9] text-[#5b7681]', Icon: Minus },
  } as const
  const { cls, Icon } = map[tone]
  return (
    <span className={`inline-flex whitespace-nowrap items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}

export function StatCard({ label, value, tone = 'neutral', hint, onClick }: { label: string; value: ReactNode; tone?: StatusTone; hint?: string; onClick?: () => void }) {
  const accent = {
    accepted: 'text-[#2f7d44]',
    warning: 'text-[#a9700f]',
    investigate: 'text-[#8f5f1d]',
    rejected: 'text-[#c02a37]',
    not_evaluated: 'text-[#5b7681]',
    neutral: 'text-[#173d50]',
  }[tone]
  const body = <>
    <p className="text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">{label}</p>
    <p className={`mono mt-2 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
    {hint ? <p className="mt-1 text-xs text-[#8ba0a5]">{hint}</p> : null}
  </>
  // A card that leads somewhere is a real button (keyboard and screen reader).
  if (onClick) return <Card className="p-0"><button type="button" onClick={onClick} className="block w-full rounded-[inherit] p-4 text-left transition hover:bg-[#f7fbfb] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">{body}</button></Card>
  return <Card className="p-4">{body}</Card>
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string; icon?: typeof CheckCircle2 }[]; active: T; onChange: (key: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[#d6e2e3] bg-white p-1" role="tablist">
      {tabs.map(({ key, label, icon: Icon }) => {
        const on = key === active
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(event) => {
              // Arrow keys move between tabs (WAI-ARIA tabs pattern).
              const keys = tabs.map((tab) => tab.key)
              const index = keys.indexOf(key)
              const next = event.key === 'ArrowRight' ? keys[(index + 1) % keys.length] : event.key === 'ArrowLeft' ? keys[(index - 1 + keys.length) % keys.length] : event.key === 'Home' ? keys[0] : event.key === 'End' ? keys[keys.length - 1] : null
              if (next == null) return
              event.preventDefault()
              onChange(next)
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              buttons?.[keys.indexOf(next)]?.focus()
            }}
            className={`flex min-h-11 items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${on ? 'bg-[#0b7f76] text-white' : 'text-[#58747d] hover:bg-[#eef6f5]'}`}
          >
            {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
            {label}
          </button>
        )
      })}
    </div>
  )
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(url, {
    ...options,
    headers,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

