'use client'

import { useState } from 'react'

export function PrintButton({ id = 'print-report' }: { id?: string }) {
  const [printing, setPrinting] = useState(false)
  async function print() {
    setPrinting(true)
    try {
      if ('fonts' in document) await document.fonts.ready
      window.print()
    } finally {
      setPrinting(false)
    }
  }
  return <button id={id} type="button" onClick={print} disabled={printing}>{printing ? 'Preparing…' : 'Print / Save PDF'}</button>
}
