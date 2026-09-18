import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/202609180007_bm_ocr.sql'), 'utf8')

describe('client-side OCR audit migration', () => {
  it('stores OCR text and draft candidates without storing invoice images or creating a stock path', () => {
    expect(sql).toContain('create table if not exists public.bm_ocr_jobs')
    expect(sql).toContain('raw_text text not null')
    expect(sql).toContain('create table if not exists public.bm_ocr_candidates')
    expect(sql).toContain('candidate_item_ids jsonb')
    expect(sql).toContain('match_method text')
    expect(sql).not.toMatch(/image_bytes|original_image|processed_image|receive_bm_stock|confirm_bm_receipt/i)
  })

  it('keeps OCR records read-only to application roles and service-role writable', () => {
    for (const table of ['bm_ocr_jobs', 'bm_ocr_candidates']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`create policy ${table}_active_read`)
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(sql).toContain(`grant all on table public.${table} to service_role`)
    }
  })
})
