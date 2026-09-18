import 'server-only'

import type { BmActor } from '@/lib/bm/types'
import type { InvoiceOcrDraftInput } from '@/lib/receiving/ocr-schemas'
import { assertReceivingEnabled, getReceivingWorkspace } from '@/lib/server/receiving'
import { writeAudit } from '@/lib/server/audit'
import { HttpError } from '@/lib/server/errors'
import { getAdminClient } from '@/lib/supabase/admin'

type RecordRow = Record<string, unknown>

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function fail(error: { message: string } | null, message = 'OCR draft database operation failed') {
  if (error) throw new HttpError(400, error.message || message)
}

function clean(value: string | null | undefined) {
  return value?.trim() || null
}

export async function createInvoiceOcrDraft(input: InvoiceOcrDraftInput, actor: BmActor) {
  await assertReceivingEnabled()
  const admin = getAdminClient()
  const requestedIds = [...new Set(input.lines.flatMap((line) => [line.stockItemId, ...line.candidateItemIds]).filter((id): id is string => Boolean(id)))]
  const { data: itemData, error: itemError } = requestedIds.length
    ? await admin.from('bm_stock_items').select('id,name').eq('is_active', true).in('id', requestedIds)
    : { data: [], error: null }
  fail(itemError)
  const itemMap = new Map(((itemData ?? []) as RecordRow[]).map((row) => [asString(row.id), asString(row.name)]))

  const { data: jobData, error: jobError } = await admin.from('bm_ocr_jobs').insert({
    workflow: 'invoice',
    status: 'completed',
    engine: input.engine,
    engine_version: clean(input.engineVersion),
    languages: input.languages,
    raw_text: input.rawText,
    confidence: input.confidence ?? null,
    created_by: actor.id,
  }).select('id').single()
  fail(jobError)
  const ocrJobId = asString((jobData as RecordRow).id)

  const normalizedLines = input.lines.map((line) => {
    const validUniqueItem = line.matchMethod === 'exact_unique' && line.stockItemId && itemMap.has(line.stockItemId)
    return {
      ...line,
      stockItemId: validUniqueItem ? line.stockItemId ?? null : null,
      descriptionText: validUniqueItem ? itemMap.get(line.stockItemId ?? '') ?? null : null,
      candidateItemIds: line.candidateItemIds.filter((id) => itemMap.has(id)),
      matchMethod: validUniqueItem ? line.matchMethod : line.matchMethod === 'exact_unique' ? 'unmatched' as const : line.matchMethod,
      matchConfidence: validUniqueItem ? line.matchConfidence ?? 1 : line.matchMethod === 'exact_unique' ? null : line.matchConfidence ?? null,
    }
  })

  const { data: invoiceData, error: invoiceError } = await admin.from('bm_invoices').insert({
    vendor_id: input.vendorId,
    invoice_no: clean(input.invoiceNo),
    invoice_date: input.invoiceDate ?? null,
    status: 'draft',
    source: 'ocr',
    ocr_job_id: ocrJobId,
    created_by: actor.id,
  }).select('id').single()
  if (invoiceError?.code === '23505') throw new HttpError(409, 'เลขที่ใบส่งของนี้ซ้ำสำหรับ vendor เดียวกัน')
  fail(invoiceError)
  const invoiceId = asString((invoiceData as RecordRow).id)

  if (normalizedLines.length) {
    const { error: lineError } = await admin.from('bm_invoice_lines').insert(normalizedLines.map((line) => ({
      invoice_id: invoiceId,
      line_no: line.lineNo,
      stock_item_id: line.stockItemId,
      catalog_no_text: clean(line.catalogNoText),
      description_text: clean(line.descriptionText),
      expected_qty: line.expectedQty,
      lot_text: clean(line.lotText),
      expiry_text: clean(line.expiryText),
      match_method: line.matchMethod,
      match_confidence: line.matchConfidence,
      closure_state: 'open',
      sort_order: line.lineNo,
    })))
    fail(lineError)
    const { error: candidateError } = await admin.from('bm_ocr_candidates').insert(normalizedLines.map((line) => ({
      ocr_job_id: ocrJobId,
      line_no: line.lineNo,
      source_text: line.sourceText,
      catalog_no_text: clean(line.catalogNoText),
      lot_text: clean(line.lotText),
      expiry_text: clean(line.expiryText),
      expected_qty: line.expectedQty,
      stock_item_id: line.stockItemId,
      match_method: line.matchMethod,
      match_confidence: line.matchConfidence,
      candidate_item_ids: line.candidateItemIds,
    })))
    fail(candidateError)
  }

  await writeAudit(actor, 'receiving.ocr-job.create', 'stock-ocr-job', ocrJobId, { invoiceId, lineCount: normalizedLines.length, engine: input.engine })
  await writeAudit(actor, 'receiving.invoice.create', 'stock-invoice', invoiceId, { vendorId: input.vendorId, source: 'ocr', ocrJobId })
  return { receiving: await getReceivingWorkspace(actor), ocrJobId, invoiceId }
}
