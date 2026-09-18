import { requireStockOperator } from '@/lib/server/auth'
import { invoiceOcrDraftSchema } from '@/lib/receiving/ocr-schemas'
import { createInvoiceOcrDraft } from '@/lib/server/receiving-ocr'
import { HttpError } from '@/lib/server/errors'
import { respond } from '@/lib/server/route'

export const runtime = 'nodejs'

function formText(formData: FormData, key: string, required = true) {
  const value = formData.get(key)
  if (typeof value === 'string') return value
  if (!required && value == null) return undefined
  throw new HttpError(400, `Missing form field: ${key}`)
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireStockOperator()
    const formData = await request.formData()
    const rawLines = formText(formData, 'lines') as string
    let lines: unknown
    try {
      lines = JSON.parse(rawLines)
    } catch {
      throw new HttpError(400, 'OCR draft lines must be valid JSON')
    }
    const parsed = invoiceOcrDraftSchema.safeParse({
      vendorId: formText(formData, 'vendorId'),
      invoiceNo: formText(formData, 'invoiceNo', false) ?? null,
      invoiceDate: formText(formData, 'invoiceDate', false) ?? null,
      rawText: formText(formData, 'rawText'),
      engine: formText(formData, 'engine'),
      engineVersion: formText(formData, 'engineVersion', false) ?? null,
      languages: formText(formData, 'languages', false) ?? 'tha+eng',
      confidence: formText(formData, 'confidence', false) ? Number(formText(formData, 'confidence', false)) : null,
      lines,
    })
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid OCR draft')
    return createInvoiceOcrDraft(parsed.data, actor)
  })
}
