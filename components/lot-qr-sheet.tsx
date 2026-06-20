'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatDate } from '@/lib/bm/rules'
import { Button, Card, PageHeader } from '@/components/ui'
import { QrCode } from '@/components/qr-code'

export interface LotQrItem {
  token: string
  itemCode: string
  itemName: string
  lotNumber: string
  expiryDate: string | null
}

// Printable QR stickers for stock lots. Each QR encodes <origin>/issue/<token> so a
// phone-camera scan opens the one-screen quick-issue for that lot.
export function LotQrSheet({ lots, origin }: { lots: LotQrItem[]; origin: string }) {
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Link href="/inventory" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0b7f76]"><ArrowLeft className="size-4" /> กลับคลัง</Link>
        <div className="mt-2">
          <PageHeader
            eyebrow="Stock"
            title="พิมพ์ QR ติด lot"
            description="ติดสติกเกอร์ QR ที่กล่อง/ขวดน้ำยา — สแกนด้วยมือถือแล้วเปิดหน้าตัด stock ของ lot นั้นทันที"
            actions={<Button onClick={() => window.print()}><Printer className="size-4" /> พิมพ์ / Print</Button>}
          />
        </div>
      </div>

      {lots.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {lots.map((lot) => (
            <Card key={lot.token} className="flex break-inside-avoid flex-col items-center gap-3 p-4 text-center">
              <QrCode value={`${origin}/issue/${lot.token}`} size={160} />
              <div>
                <p className="font-bold text-[#173d50]">{lot.itemCode}</p>
                <p className="text-xs text-[#789097]">{lot.itemName}</p>
                <p className="mono mt-1 text-xs text-[#173d50]">LOT {lot.lotNumber}</p>
                <p className="text-[11px] text-[#8ba0a5]">EXP {formatDate(lot.expiryDate)}</p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-[#789097]">ยังไม่มี lot ที่มีของคงเหลือ</Card>
      )}
    </div>
  )
}
