'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function usePagination(totalItems: number, pageSize: number) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const end = Math.min(start + pageSize, totalItems)
  return { page: currentPage, pageCount, start, end, setPage }
}

export function Pagination({ page, pageCount, start, end, total, onChange }: { page: number; pageCount: number; start: number; end: number; total: number; onChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-[#e1eaeb] bg-[#fbfdfd] px-4 py-2.5">
      <p className="text-xs text-[#8ba0a5]">{start + 1}–{end} จาก {total}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
          className="flex items-center gap-1 rounded border border-[#c9dadd] bg-white px-2 py-1 text-xs font-bold text-[#55727c] hover:bg-[#f5f9fa] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" /> ก่อนหน้า
        </button>
        <span className="mono text-xs font-bold text-[#315763]">{page} / {pageCount}</span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onChange(Math.min(pageCount, page + 1))}
          className="flex items-center gap-1 rounded border border-[#c9dadd] bg-white px-2 py-1 text-xs font-bold text-[#55727c] hover:bg-[#f5f9fa] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
        >
          ถัดไป <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
