'use client'

import QRCode from 'qrcode'
import type { StockItem, StockLocation, StockLot } from '@/lib/bm/types'
import { formatDate } from '@/lib/bm/rules'

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export async function printLotLabel(lot: StockLot, item: StockItem, location?: StockLocation) {
  const href = `${window.location.origin}/scan/lot/${encodeURIComponent(lot.internalQrToken)}`
  const qr = await QRCode.toDataURL(href, { margin: 0, width: 96 })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: 60mm 20mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Courier New", Courier, monospace; }
    .sticker { width: 60mm; height: 20mm; display: grid; grid-template-columns: 18mm 1fr; gap: 1.5mm; overflow: hidden; padding: 1.5mm; }
    img { width: 17mm; height: 17mm; }
    .code { font-size: 6.8pt; font-weight: 900; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .line { margin-top: 1mm; font-size: 5.2pt; color: #222; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tiny { margin-top: 1mm; font-size: 4.8pt; color: #555; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

