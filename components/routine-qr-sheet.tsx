"use client"

import Link from "next/link"
import { ArrowLeft, ExternalLink, Printer } from "lucide-react"
import { QrCode } from "@/components/qr-code"
import { Button, Card, PageHeader } from "@/components/ui"

type RoutineQrEquipment = {
  id: string
  code: string
  name: string
  qrToken: string
}

export function RoutineQrSheet({
  equipment,
  origin,
}: {
  equipment: RoutineQrEquipment
  origin: string
}) {
  const routineUrl = new URL(`/equipment/routine/${encodeURIComponent(equipment.qrToken)}`, origin).toString()

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Equipment · Routine Maintenance"
          title="QR Routine Maintenance"
          description="พิมพ์ QR สำหรับเปิด Checklist Routine Maintenance ของเครื่องมือนี้"
          actions={
            <div className="flex gap-2">
              <Link href={`/equipment?view=registry&equipment=${equipment.id}`}>
                <Button variant="secondary"><ArrowLeft className="size-4" /> กลับทะเบียน</Button>
              </Link>
              <Button onClick={() => window.print()}><Printer className="size-4" /> พิมพ์ QR</Button>
            </div>
          }
        />
      </div>
      <Card className="mx-auto max-w-md p-6 text-center print:border-2 print:border-[#173d50] print:shadow-none">
        <p className="text-[10px] font-bold tracking-[.18em] text-[#0b7f76] uppercase">Chonburi Hospital · Stock-BM</p>
        <h1 className="mt-2 text-2xl font-bold text-[#173d50]">Routine Maintenance</h1>
        <p className="mt-2 text-sm font-bold text-[#315763]">{equipment.code} · {equipment.name}</p>
        <div className="mx-auto mt-5 w-fit rounded-lg border border-[#d5e4e4] bg-white p-3" aria-label={`QR Routine Maintenance ของ ${equipment.name}`}>
          <QrCode value={routineUrl} size={260} />
        </div>
        <p className="mt-4 text-sm text-[#58747d]">สแกนเพื่อเปิดแบบฟอร์ม Routine Maintenance</p>
        <a className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#0b7f76] hover:underline print:hidden" href={routineUrl} target="_blank" rel="noreferrer">
          เปิดหน้าฟอร์มทดสอบ <ExternalLink className="size-3.5" />
        </a>
        <p className="mt-4 break-all text-[10px] text-[#8ba0a5] print:hidden">{routineUrl}</p>
      </Card>
    </div>
  )
}
