import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, Minus, XCircle } from 'lucide-react'

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
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-w-0 max-w-full w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition placeholder:text-[#9aafb4] focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10 ${className}`}
      {...props}
    />
  )
}

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition placeholder:text-[#9aafb4] focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10 ${className}`}
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

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'danger' | 'success' }) {
  const styles = {
    info: 'border-[#bddedc] bg-[#f1faf9] text-[#176b68]',
    warning: 'border-[#eed4a6] bg-[#fff9ed] text-[#99601b]',
    danger: 'border-[#efc7cc] bg-[#fff5f6] text-[#a83541]',
    success: 'border-[#c6e2ca] bg-[#f3faf4] text-[#4b7b51]',
  }
  return <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${styles[tone]}`}><AlertTriangle className="mt-0.5 size-4 shrink-0" />{children}</div>
}

export type StatusTone = 'accepted' | 'warning' | 'rejected' | 'neutral'

// Status is always conveyed with icon + text + colour (never colour alone).
export function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const map = {
    accepted: { cls: 'border-[#c6e2ca] bg-[#f1faf3] text-[#2f7d44]', Icon: CheckCircle2 },
    warning: { cls: 'border-[#eed4a6] bg-[#fff9ed] text-[#a9700f]', Icon: AlertTriangle },
    rejected: { cls: 'border-[#efc7cc] bg-[#fff5f6] text-[#c02a37]', Icon: XCircle },
    neutral: { cls: 'border-[#d2dee0] bg-[#f6f9f9] text-[#5b7681]', Icon: Minus },
  } as const
  const { cls, Icon } = map[tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}

export function StatCard({ label, value, tone = 'neutral', hint }: { label: string; value: ReactNode; tone?: StatusTone; hint?: string }) {
  const accent = {
    accepted: 'text-[#2f7d44]',
    warning: 'text-[#a9700f]',
    rejected: 'text-[#c02a37]',
    neutral: 'text-[#173d50]',
  }[tone]
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">{label}</p>
      <p className={`mono mt-2 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#8ba0a5]">{hint}</p> : null}
    </Card>
  )
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
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${on ? 'bg-[#0b7f76] text-white' : 'text-[#58747d] hover:bg-[#eef6f5]'}`}
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
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Request failed')
  return data as T
}

