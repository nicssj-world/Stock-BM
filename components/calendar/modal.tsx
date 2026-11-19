'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Native <dialog>: focus trap, Escape and backdrop come from the browser. Bottom sheet on phones (calendar.css). */
export function Modal({ open, onClose, title, children, labelId }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelId: string }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="cal-dialog"
      aria-labelledby={labelId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open ? (
        <div className="grid gap-4 p-[18px]">
          <header className="flex items-center justify-between gap-2">
            <h2 id={labelId} className="text-lg font-bold text-[#173d50]">{title}</h2>
            <button type="button" onClick={onClose} aria-label="ปิด" className="inline-flex size-10 items-center justify-center rounded-md text-[#55727c] hover:bg-[#eef5f4] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">
              <X className="size-5" />
            </button>
          </header>
          {children}
        </div>
      ) : null}
    </dialog>
  )
}
