'use client'

import { useState } from 'react'
import { Camera, X } from 'lucide-react'
import { useCameraScanner } from '@/components/camera-scanner'
import { Button, Input, Notice } from '@/components/ui'

/**
 * A text field that can also be filled by scanning a barcode/QR with the
 * camera — e.g. a receipt number printed on the vendor's invoice or
 * receiving slip. This reads the raw decoded text only (no GS1/HIBC
 * parsing): the value here is a free-text document number, not package
 * data, so it is never run through the barcode AI parser.
 */
export function ScanTextField({
  label,
  hint,
  value,
  onChange,
  disabled = false,
  placeholder,
  scanLabel,
  scanMode = 'document',
  onScanned,
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  scanLabel?: string
  scanMode?: 'package' | 'document'
  onScanned?: (code: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const { cameraOn, toggle, videoRef } = useCameraScanner({
    onScan: (code: string) => {
      const value = code.replace(/[\r\n]+/g, '').trim()
      if (!value) return
      onChange(value)
      onScanned?.(value)
      setError(null)
    },
    onError: setError,
    stopOnScan: true,
    scanMode,
  })

  return <div className="block">
    <p className="mb-1 text-xs font-semibold text-[#58747d]">{label}</p>
    <div className="flex gap-2">
      <Input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        aria-label={cameraOn ? 'ปิดกล้อง' : (scanLabel ?? `สแกน${label}ด้วยกล้อง`)}
        onClick={toggle}
      >
        {cameraOn ? <X className="size-4" /> : <Camera className="size-4" />}
      </Button>
    </div>
    {hint ? <p className="mt-1 text-[11px] text-[#8ba0a5]">{hint}</p> : null}
    {cameraOn ? <div className="relative mt-2 overflow-hidden rounded-md border border-[#d6e2e3] bg-black">
      <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-[35%] w-[86%] rounded-lg border-2 border-[#5de1d0] shadow-[0_0_0_999px_rgba(0,0,0,.22),0_0_18px_rgba(93,225,208,.8)]" />
      </div>
    </div> : null}
    {cameraOn ? <p className="mt-1 text-xs text-[#58747d]">วางบาร์โค้ดแนวนอนให้เต็มกรอบ เลื่อนกล้องเข้าออกเพื่อปรับโฟกัส</p> : null}
    {error ? <Notice tone="danger">{error} — สามารถพิมพ์เลขจากบาร์โค้ดแทนได้</Notice> : null}
  </div>
}
