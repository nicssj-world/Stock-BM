'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import type { EnvUnit } from '@/lib/env/types'
import { Button, Card, PageHeader } from '@/components/ui'
import { QrCode } from '@/components/qr-code'

const KIND_LABEL: Record<string, string> = { fridge: 'ตู้เย็น', freezer: 'ตู้แช่แข็ง', room: 'ห้อง', incubator: 'ตู้บ่ม', other: 'อื่นๆ' }

// Printable QR stickers — one per monitored unit. The QR encodes the request origin
// (from the server) so it works on whatever domain the app is deployed to. Scan opens
// /environment/u/<token>.
export function EnvQrSheet({ units, origin }: { units: EnvUnit[]; origin: string }) {
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/environment" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ArrowLeft className="size-4" /> กลับ Temperature</Link>
        <div className="mt-2">
          <PageHeader
            eyebrow="Temperature"
            title="พิมพ์ QR ติดตู้"
            description="ติดสติกเกอร์ QR ที่หน้าตู้ — สแกนด้วยมือถือแล้วเปิดฟอร์มบันทึกของตู้นั้นทันที"
            actions={<Button onClick={() => window.print()}><Printer className="size-4" /> พิมพ์ / Print</Button>}
          />
        </div>
      </div>

      {units.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {units.map((unit) => (
            <Card key={unit.id} className="flex break-inside-avoid flex-col items-center gap-3 p-4 text-center">
              {origin ? <QrCode value={`${origin}/environment/u/${unit.qrToken}`} size={170} /> : <div className="size-[170px]" />}
              <div>
                <p className="font-bold text-[#173d50]">{unit.name}</p>
                <p className="mono text-xs text-[#789097]">{unit.code} · {KIND_LABEL[unit.kind] ?? unit.kind}</p>
                <p className="mono text-xs text-[#789097]">ช่วง {unit.minLimit ?? '—'}–{unit.maxLimit ?? '—'} {unit.unit}</p>
                {unit.thermometerId ? <p className="mono text-xs text-[#789097]">TM {unit.thermometerId}</p> : null}
                {unit.dataloggerId ? <p className="mono text-xs text-[#789097]">DL {unit.dataloggerId}</p> : null}
                {unit.calibrationDueDate ? <p className="mono text-xs text-[#789097]">Cal {unit.calibrationDueDate}</p> : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-[#789097]">ยังไม่มีตู้ที่เปิดใช้งาน</Card>
      )}
    </div>
  )
}
