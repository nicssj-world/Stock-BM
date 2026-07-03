'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertOctagon, CalendarClock, CheckCircle2, FlaskConical, MapPin, PackageSearch, QrCode, ScanLine, Thermometer } from 'lucide-react'
import type { BmActor, ScanResolution, StockWorkspace } from '@/lib/bm/types'
import type { EnvWorkspace } from '@/lib/env/types'
import type { HpvDashboard } from '@/lib/hpv/types'
import { formatDate, formatQuantity } from '@/lib/bm/rules'
import { api, Button, Card, Input, Notice, PageHeader } from '@/components/ui'

export function DashboardView({ actor, stock, env, hpv }: { actor: BmActor; stock: StockWorkspace; env: EnvWorkspace; hpv: HpvDashboard }) {
  const router = useRouter()
  const [scan, setScan] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const code = scan.trim()
    if (!code) return
    setNotice('')
    const { result } = await api<{ result: ScanResolution }>('/api/scan/resolve', { method: 'POST', body: JSON.stringify({ code }) })
    if (result.href) router.push(result.href)
    else setNotice(`ไม่พบรหัส / Not found: ${code}`)
  }

  const low = stock.items.filter((item) => item.isLowStock).slice(0, 8)
  const expiring = stock.items
    .flatMap((item) => item.lots.map((lot) => ({ item, lot })))
    .filter(({ lot }) => lot.totalOnHand > 0 && (lot.expiryState === 'expiring' || lot.expiryState === 'expired'))
    .slice(0, 8)

  const pendingCards = env.cards.filter((c) => !c.loggedToday)
  const outOfRangeCards = env.cards.filter((c) => c.status === 'out-of-range')
  const attentionCards = [...outOfRangeCards, ...pendingCards.filter((c) => c.status !== 'out-of-range')].slice(0, 6)

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader
        eyebrow="BM Stock Control"
        title="ภาพรวม / Dashboard"
        description={`สวัสดี ${actor.displayName} · ${actor.role}`}
        actions={<Button onClick={() => router.push('/movements?mode=receive')}>รับเข้า / Receive</Button>}
      />

      <Card className="p-4">
        <form onSubmit={submit} className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <ScanLine className="absolute top-3 left-3 size-5 text-[#7b979c]" />
            <Input autoFocus value={scan} onChange={(event) => setScan(event.target.value)} className="h-12 pl-11 mono text-base" placeholder="Scan QR / barcode แล้วกด Enter" />
          </div>
          <Button className="h-12"><QrCode className="size-4" /> Resolve</Button>
        </form>
        {notice ? <div className="mt-3"><Notice tone="warning">{notice}</Notice></div> : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Kpi icon={<PackageSearch />} label="Active items" value={stock.activeItemCount} />
        <Kpi icon={<AlertOctagon />} label="Low stock" value={stock.lowStockItemCount} tone="danger" />
        <Kpi icon={<CalendarClock />} label="Expiring lots" value={stock.expiringLotCount} tone="amber" />
        <Kpi icon={<AlertOctagon />} label="Expired lots" value={stock.expiredLotCount} tone="danger" />
        <Kpi icon={<MapPin />} label="Locations" value={stock.locationCount} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <SectionTitle title="Low stock / ต่ำกว่าขั้นต่ำ" href="/reports" />
          <div className="divide-y divide-[#edf2f2]">
            {low.map((item) => (
              <Row key={item.id} title={`${item.itemCode} · ${item.name}`} meta={`${formatQuantity(item.usableOnHand)} ${item.unit} / min ${formatQuantity(item.minimumStock)}`} danger />
            ))}
            {!low.length ? <Empty text="ไม่มีรายการ low stock" /> : null}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle title="Expiry watch / ใกล้หมดอายุ" href="/reports" />
          <div className="divide-y divide-[#edf2f2]">
            {expiring.map(({ item, lot }) => (
              <Row key={lot.id} title={`${item.itemCode} · ${lot.lotNumber}`} meta={`EXP ${formatDate(lot.expiryDate)} · ${formatQuantity(lot.totalOnHand)} ${item.unit}`} danger={lot.expiryState === 'expired'} />
            ))}
            {!expiring.length ? <Empty text="ไม่มี lot ใกล้หมดอายุ" /> : null}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle title="อุณหภูมิวันนี้" href="/environment" />
          {outOfRangeCards.length > 0 ? (
            <div className="flex items-center gap-2 border-b border-[#ffd5d8] bg-[#fff1f2] px-4 py-2 text-xs font-semibold text-[#a83541]">
              <AlertOctagon className="size-3.5 shrink-0" />
              {outOfRangeCards.length} ตู้มีค่านอกช่วง — ต้องดำเนินการแก้ไข
            </div>
          ) : null}
          <div className="divide-y divide-[#edf2f2]">
            {attentionCards.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-[#2f7d44]">
                <CheckCircle2 className="size-4" />
                บันทึกครบทุกตู้แล้ว ({env.summary.loggedToday}/{env.summary.unitCount} ตู้)
              </div>
            ) : (
              attentionCards.map((card) => (
                <TempRow key={card.unit.id} card={card} />
              ))
            )}
          </div>
          {env.summary.openCorrectiveActions > 0 ? (
            <div className="border-t border-[#edf2f2] px-4 py-2 text-[11px] text-[#a76511]">
              <Link href="/environment" className="hover:underline">{env.summary.openCorrectiveActions} corrective action ค้างอยู่ →</Link>
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle title="HPV Samples" href="/hpv" />
          <div className="divide-y divide-[#edf2f2]">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex size-8 items-center justify-center rounded-md bg-[#e8f7f5]"><FlaskConical className="size-4 text-[#0b7f76]" /></div>
              <div>
                <p className="font-semibold text-[#315763]">ตัวอย่างในคลัง</p>
                <p className="text-xs text-[#7b9298]">สถานะ stored</p>
              </div>
              <span className="mono ml-auto text-lg font-bold text-[#173d50]">{hpv.storedSamples}</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className={`flex size-8 items-center justify-center rounded-md ${hpv.boxesDueDestruction > 0 ? 'bg-[#fff1f2]' : 'bg-[#f3f6f7]'}`}>
                <AlertOctagon className={`size-4 ${hpv.boxesDueDestruction > 0 ? 'text-[#b33b46]' : 'text-[#7b9298]'}`} />
              </div>
              <div>
                <p className={`font-semibold ${hpv.boxesDueDestruction > 0 ? 'text-[#a83541]' : 'text-[#315763]'}`}>กล่องครบกำหนดทำลาย</p>
                <p className="text-xs text-[#7b9298]">destroy_due_at ≤ วันนี้</p>
              </div>
              <span className={`mono ml-auto text-lg font-bold ${hpv.boxesDueDestruction > 0 ? 'text-[#be3d49]' : 'text-[#173d50]'}`}>{hpv.boxesDueDestruction}</span>
            </div>
          </div>
          {hpv.boxesDueDestruction > 0 ? (
            <div className="border-t border-[#edf2f2] px-4 py-2 text-[11px] text-[#a76511]">
              <Link href="/hpv" className="hover:underline">ดูกล่องที่ต้องทำลาย →</Link>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}

function TempRow({ card }: { card: EnvWorkspace['cards'][number] }) {
  const isOutOfRange = card.status === 'out-of-range'
  const value = card.todayReading?.readingValue ?? card.lastReading?.readingValue
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <Thermometer className={`size-4 shrink-0 ${isOutOfRange ? 'text-[#b33b46]' : 'text-[#c08000]'}`} />
        <div>
          <p className="font-semibold text-[#315763]">{card.unit.name}</p>
          <p className="mt-0.5 text-xs text-[#7b9298]">
            {card.unit.code}
            {isOutOfRange && value != null ? ` · ${value} ${card.unit.unit} (ช่วง ${card.unit.minLimit ?? '—'}–${card.unit.maxLimit ?? '—'})` : ' · ยังไม่บันทึกวันนี้'}
          </p>
        </div>
      </div>
      <span className={`rounded px-2 py-1 text-[10px] font-bold ${isOutOfRange ? 'bg-[#fff1f2] text-[#b33b46]' : 'bg-[#fff8e8] text-[#a76511]'}`}>
        {isOutOfRange ? 'นอกช่วง' : 'รอบันทึก'}
      </span>
    </div>
  )
}

function Kpi({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: number; tone?: 'default' | 'amber' | 'danger' }) {
  const colors = tone === 'danger' ? 'bg-[#fff1f2] text-[#b33b46]' : tone === 'amber' ? 'bg-[#fff8e8] text-[#a76511]' : 'bg-[#e8f7f5] text-[#0b7f76]'
  return (
    <Card className="p-4">
      <div className={`flex size-9 items-center justify-center rounded-md [&>svg]:size-4 ${colors}`}>{icon}</div>
      <p className="mt-4 text-[11px] font-bold text-[#789097]">{label}</p>
      <p className={`mono mt-1 text-2xl font-bold ${tone === 'danger' ? 'text-[#be3d49]' : 'text-[#173d50]'}`}>{value}</p>
    </Card>
  )
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
      <span className="font-bold text-[#173d50]">{title}</span>
      {href ? <Link href={href} className="text-xs text-[#58747d] hover:text-[#0b7f76] hover:underline">ดูทั้งหมด →</Link> : null}
    </div>
  )
}

function Row({ title, meta, danger }: { title: string; meta: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-semibold text-[#315763]">{title}</p>
        <p className="mt-0.5 text-xs text-[#7b9298]">{meta}</p>
      </div>
      <span className={`rounded px-2 py-1 text-[10px] font-bold ${danger ? 'bg-[#fff1f2] text-[#b33b46]' : 'bg-[#fff8e8] text-[#a76511]'}`}>{danger ? 'ACTION' : 'WATCH'}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">{text}</p>
}
