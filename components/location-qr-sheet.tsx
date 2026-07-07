'use client'

import Link from 'next/link'
import { ArrowLeft, MapPin, Printer } from 'lucide-react'
import { Button, Card, PageHeader } from '@/components/ui'
import { QrCode } from '@/components/qr-code'

export interface LocationQrItem {
  id: string
  code: string
  name: string
  storageCondition: string | null
}

export function LocationQrSheet({ locations, origin }: { locations: LocationQrItem[]; origin: string }) {
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/inventory" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ArrowLeft className="size-4" /> กลับคลัง</Link>
        <div className="mt-2">
          <PageHeader
            eyebrow="Stock"
            title="พิมพ์ QR ติด location"
            description="ติด QR ที่ตู้/ชั้นวาง — สแกนแล้วเปิดคลังพร้อมกรอง location นั้นทันที"
            actions={<Button onClick={() => window.print()}><Printer className="size-4" /> พิมพ์ / Print</Button>}
          />
        </div>
      </div>

      {locations.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {locations.map((location) => (
            <Card key={location.id} className="flex break-inside-avoid flex-col items-center gap-3 p-4 text-center">
              <QrCode value={`${origin}/scan/location/${location.id}`} size={160} />
              <div>
                <div className="mx-auto flex size-7 items-center justify-center rounded-md bg-[#e8f7f5] text-[#0b7f76]"><MapPin className="size-4" /></div>
                <p className="mono mt-2 font-bold text-[#173d50]">{location.code}</p>
                <p className="text-xs text-[#789097]">{location.name}</p>
                {location.storageCondition ? <p className="mt-1 text-[11px] text-[#8ba0a5]">{location.storageCondition}</p> : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-[#789097]">ยังไม่มี location ที่ active</Card>
      )}
    </div>
  )
}
