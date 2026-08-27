'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Eye, FileUp, Loader2, Paperclip, Trash2, X } from 'lucide-react'
import { api } from '@/components/ui'

type AttachmentModule = 'iqc' | 'eqa' | 'stock' | 'env' | 'lotverif' | 'hpv' | 'equipment'

interface Attachment {
  id: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  createdAt: string
}

function humanSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function previewKind(item: Attachment) {
  const fileName = item.fileName.toLowerCase()
  if (item.contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(fileName)) return 'image'
  if (item.contentType === 'application/pdf' || fileName.endsWith('.pdf')) return 'pdf'
  return null
}

export function AttachmentList({
  module,
  entityType,
  entityId,
  kind,
  canDelete = false,
  canUpload = true,
  accept,
  label = 'ไฟล์แนบ / Attachments',
  onChanged,
}: {
  module: AttachmentModule
  entityType: string
  entityId: string
  kind: string
  canDelete?: boolean
  canUpload?: boolean
  accept?: string
  label?: string
  onChanged?: () => void | Promise<void>
}) {
  const [items, setItems] = useState<Attachment[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      const params = new URLSearchParams({ module, entityType, entityId })
      const data = await api<{ attachments: Attachment[] }>(`/api/attachments?${params}`)
      setItems(data.attachments)
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ module, entityType, entityId })
    api<{ attachments: Attachment[] }>(`/api/attachments?${params}`)
      .then((data) => {
        if (active) setItems(data.attachments)
      })
      .catch(() => {
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [module, entityType, entityId])

  useEffect(() => {
    if (!preview) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [preview])

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('module', module)
      form.append('entityType', entityType)
      form.append('entityId', entityId)
      form.append('kind', kind)
      const response = await fetch('/api/attachments', { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error ?? 'อัปโหลดไม่สำเร็จ')
      await refresh()
      await onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove(id: string) {
    if (!window.confirm('ลบไฟล์นี้?')) return
    setBusy(true)
    try {
      await api(`/api/attachments/${id}`, { method: 'DELETE' })
      if (preview?.id === id) setPreview(null)
      await refresh()
      await onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-[#e3ebec] bg-[#fbfdfd] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#55727c]"><Paperclip className="size-3.5" /> {label}</p>
        {canUpload ? <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-[#c9dadd] bg-white px-2.5 py-1 text-xs font-semibold text-[#244854] hover:border-[#7fa9ad]">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />} แนบไฟล์
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
            }}
          />
        </label> : null}
      </div>
      {error ? <p className="mt-2 text-xs text-[#c02a37]" role="alert">{error}</p> : null}
      <ul className="mt-2 space-y-1">
        {items === null ? <li className="text-xs text-[#789097]" role="status">กำลังโหลดไฟล์แนบ…</li> : null}
        {items?.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded border border-[#e9eff0] bg-white px-2 py-1 text-xs">
            <span className="min-w-0 truncate text-[#315763]">{item.fileName} <span className="text-[#9aafb4]">{humanSize(item.sizeBytes)}</span></span>
            <span className="flex shrink-0 items-center gap-1">
              {previewKind(item) ? <button type="button" onClick={() => setPreview(item)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded p-1 text-[#0b7f76] hover:bg-[#eef6f5]" aria-label={`ดู ${item.fileName}`} title="ดูไฟล์ในหน้านี้"><Eye className="size-3.5" /></button> : null}
              <a href={`/api/attachments/${item.id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded p-1 text-[#0b7f76] hover:bg-[#eef6f5]" aria-label={`ดาวน์โหลด ${item.fileName}`}><Download className="size-3.5" /></a>
              {canDelete ? <button type="button" onClick={() => remove(item.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded p-1 text-[#c02a37] hover:bg-[#fff0f1]" aria-label={`ลบ ${item.fileName}`}><Trash2 className="size-3.5" /></button> : null}
            </span>
          </li>
        ))}
        {items && !items.length ? <li className="text-xs text-[#9aafb4]">ยังไม่มีไฟล์แนบ</li> : null}
      </ul>
      {preview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="presentation" onMouseDown={() => setPreview(null)}><section role="dialog" aria-modal="true" aria-label={`ตัวอย่างไฟล์ ${preview.fileName}`} className="flex h-[min(880px,calc(100dvh-1.5rem))] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[#c9dadd] bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e3ebec] bg-[#f6fafa] px-3 py-2.5 sm:px-4"><p className="min-w-0 truncate text-sm font-semibold text-[#315763]">ดูไฟล์: {preview.fileName}</p><button type="button" autoFocus onClick={() => setPreview(null)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded p-1 text-[#55727c] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7f76]" aria-label="ปิดตัวอย่างไฟล์"><X className="size-5" /></button></header><div className="min-h-0 flex-1 bg-[#f6f9f9]">{previewKind(preview) === 'image' ? <img src={`/api/attachments/${preview.id}`} alt={preview.fileName} className="h-full w-full object-contain" /> : <iframe title={preview.fileName} src={`/api/attachments/${preview.id}`} className="h-full w-full bg-white" />}</div></section></div> : null}
    </div>
  )
}
