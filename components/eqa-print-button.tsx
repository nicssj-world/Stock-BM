'use client'

import { useState } from 'react'

export function EqaPrintButton() {
  const [loading, setLoading] = useState(false)
  async function print() {
    setLoading(true)
    try {
      if ('fonts' in document) await document.fonts.ready
      window.print()
    } finally {
      setLoading(false)
    }
  }
  return <button type="button" onClick={print} disabled={loading}>{loading ? 'กำลังโหลดฟอนต์…' : 'Print / Save PDF'}</button>
}
