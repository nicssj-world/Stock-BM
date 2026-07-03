'use client'

import QRCode from 'qrcode'
import type { StockItem, StockLocation, StockLot } from '@/lib/bm/types'
import { formatDate } from '@/lib/bm/rules'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export async function printLotLabel(lot: StockLot, item: StockItem, location?: StockLocation) {
  // Scanning the sticker opens the one-screen quick-issue for this lot directly.
  const href = `${window.location.origin}/issue/${encodeURIComponent(lot.internalQrToken)}`
  const qr = await QRCode.toDataURL(href, { margin: 1, width: 220 })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 60mm 20mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 60mm; height: 18mm; overflow: hidden; background: #fff; }
    body { font-family: "Courier New", Courier, monospace; color: #000; page-break-after: avoid; }
    .sticker {
      position: fixed;
      left: 5.4mm;
      top: 2.4mm;
      width: 49mm;
      height: 14.6mm;
      display: grid;
      grid-template-columns: 13.2mm 1fr;
      gap: 2mm;
      overflow: hidden;
      page-break-inside: avoid;
    }
    img { width: 13.2mm; height: 13.2mm; image-rendering: pixelated; }
    .code { font-size: 5.3pt; font-weight: 900; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .line { margin-top: 0.45mm; font-size: 4pt; color: #000; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tiny { margin-top: 0.45mm; font-size: 3.75pt; color: #000; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style></head><body>
    <div class="sticker">
      <img src="${qr}" />
      <div>
        <div class="code">${escapeHtml(item.itemCode)}</div>
        <div class="line">LOT ${escapeHtml(lot.lotNumber)}</div>
        <div class="line">EXP ${escapeHtml(formatDate(lot.expiryDate))}</div>
        <div class="tiny">${escapeHtml(location ? `${location.code} ${location.name}` : item.name)}</div>
      </div>
    </div>
  </body></html>`
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 250)
}

