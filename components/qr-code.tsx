'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Renders a QR code as inline SVG (vector — crisp when printed). The SVG markup is
// generated locally by the qrcode library, so no data leaves the browser.
export function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toString(value, { type: 'svg', margin: 1, width: size })
      .then((markup) => { if (active) setSvg(markup) })
      .catch(() => { if (active) setSvg('') })
    return () => { active = false }
  }, [value, size])

  if (!svg) return <div style={{ width: size, height: size }} className="animate-pulse rounded bg-[#eef4f3]" />
  return <div aria-hidden style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
}
