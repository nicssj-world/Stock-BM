'use client'

export const OCR_MAX_EDGE = 1600

export const OCR_ASSET_PATHS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/tesseract-core-lstm.wasm.js',
  langPath: '/ocr/lang-data',
} as const

export const OCR_PASS_CONFIG = [
  { id: 'full', label: 'OCR pass 1 · full corrected page', maxEdgeMultiplier: 1, psm: '3' as const, variant: 'normal' as const },
  { id: 'line_items', label: 'OCR pass 2 · line-item enhanced', maxEdgeMultiplier: 1.5, psm: '6' as const, variant: 'line_items' as const },
  { id: 'numeric', label: 'OCR pass 3 · catalog/numeric recovery', maxEdgeMultiplier: 2, psm: '11' as const, variant: 'numeric' as const, whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_/.' },
] as const

export type OcrPassId = (typeof OCR_PASS_CONFIG)[number]['id']

export type OcrProgress = {
  status: string
  progress: number
}

export type PreparedOcrImage = {
  blob: Blob
  dataUrl: string
  width: number
  height: number
}

export type OcrLineEvidence = {
  text: string
  confidence: number | null
  bbox?: { left: number; top: number; width: number; height: number }
}

export type OcrPassResult = {
  id: OcrPassId
  label: string
  text: string
  confidence: number | null
  lines: OcrLineEvidence[]
}

export type OcrMergedLine = {
  text: string
  passes: OcrPassId[]
  confidence: number | null
  bbox?: { left: number; top: number; width: number; height: number }
}

export type OcrResult = {
  text: string
  confidence: number | null
  preparedImage: PreparedOcrImage
  passes: OcrPassResult[]
  lines: OcrMergedLine[]
}

export type OcrOptions = {
  signal?: AbortSignal
  onProgress?: (progress: OcrProgress) => void
  maxEdge?: number
}

export type OcrPassInput = {
  id: OcrPassId
  text: string
  confidence: number | null
  lines?: OcrLineEvidence[]
}

export function downscaledImageSize(width: number, height: number, maxEdge = OCR_MAX_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 0, height: 0 }
  const safeMaxEdge = Math.max(1, Math.floor(maxEdge))
  const scale = Math.min(1, safeMaxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function abortError() {
  const error = new Error('OCR was cancelled')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}

function loadImage(source: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source)
    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to load OCR image'))
    }
    image.decoding = 'async'
    image.src = typeof source === 'string' ? source : objectUrl!
  })
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to encode OCR image')), 'image/jpeg', 0.9)
  })
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function enhanceCanvas(canvas: HTMLCanvasElement, variant: 'line_items' | 'numeric') {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Unable to create OCR enhancement canvas')
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Float32Array(canvas.width * canvas.height)
  for (let index = 0; index < source.length; index += 1) {
    const offset = index * 4
    source[index] = image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = y * canvas.width + x
      const center = source[index]
      const left = source[y * canvas.width + Math.max(0, x - 1)]
      const right = source[y * canvas.width + Math.min(canvas.width - 1, x + 1)]
      const up = source[Math.max(0, y - 1) * canvas.width + x]
      const down = source[Math.min(canvas.height - 1, y + 1) * canvas.width + x]
      const localAverage = (left + right + up + down) / 4
      const detail = center - localAverage
      const value = variant === 'numeric'
        ? center < localAverage - 3 ? 24 : 245
        : 128 + (center - 128) * 1.45 + detail * 0.7
      const output = clampByte(value)
      const offset = index * 4
      image.data[offset] = output
      image.data[offset + 1] = output
      image.data[offset + 2] = output
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
}

async function renderPreparedOcrImage(image: HTMLImageElement, maxEdge: number, variant: 'normal' | 'line_items' | 'numeric'): Promise<PreparedOcrImage> {
  const size = downscaledImageSize(image.naturalWidth, image.naturalHeight, maxEdge)
  if (!size.width || !size.height) throw new Error('OCR image has invalid dimensions')
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Unable to create OCR canvas')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, size.width, size.height)
  if (variant !== 'normal') enhanceCanvas(canvas, variant)
  return {
    blob: await canvasBlob(canvas),
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    width: size.width,
    height: size.height,
  }
}

export async function prepareOcrImage(source: string | Blob, maxEdge = OCR_MAX_EDGE): Promise<PreparedOcrImage> {
  if (typeof document === 'undefined') throw new Error('OCR image preparation requires a browser')
  const image = await loadImage(source)
  return renderPreparedOcrImage(image, maxEdge, 'normal')
}

async function prepareOcrPassImages(source: string | Blob, maxEdge: number) {
  if (typeof document === 'undefined') throw new Error('OCR image preparation requires a browser')
  const image = await loadImage(source)
  const prepared = await Promise.all(OCR_PASS_CONFIG.map((pass) => renderPreparedOcrImage(
    image,
    Math.min(3200, Math.round(maxEdge * pass.maxEdgeMultiplier)),
    pass.variant,
  )))
  return OCR_PASS_CONFIG.map((pass, index) => ({ pass, image: prepared[index] }))
}

function progressStatus(status: string) {
  if (status === 'initializing tesseract') return 'กำลังโหลด OCR engine'
  if (status === 'loading language traineddata') return 'กำลังโหลดภาษาไทยและอังกฤษ'
  if (status === 'initializing api') return 'กำลังเตรียม OCR'
  if (status === 'recognizing text') return 'กำลังอ่านข้อความ'
  return status
}

function canonicalOcrLine(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function looksLikeCatalogToken(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9]/g, '')
  return normalized.length >= 4 && (normalized.match(/\d/g) ?? []).length >= 3
}

function lineEvidencePasses(left: OcrLineEvidence, right: OcrLineEvidence) {
  if (!left.bbox || !right.bbox) return true
  const leftRight = left.bbox.left + left.bbox.width
  const rightRight = right.bbox.left + right.bbox.width
  const horizontalGap = Math.max(0, left.bbox.left - rightRight, right.bbox.left - leftRight)
  const verticalGap = Math.max(0, left.bbox.top - (right.bbox.top + right.bbox.height), right.bbox.top - (left.bbox.top + left.bbox.height))
  return horizontalGap <= Math.max(left.bbox.width, right.bbox.width) && verticalGap <= Math.max(left.bbox.height, right.bbox.height) * 2
}

function sameMergedEvidence(left: OcrLineEvidence, right: OcrLineEvidence) {
  const leftKey = canonicalOcrLine(left.text)
  const rightKey = canonicalOcrLine(right.text)
  if (!leftKey || !rightKey) return false
  if (leftKey === rightKey) return true
  const shorter = leftKey.length <= rightKey.length ? leftKey : rightKey
  const longer = leftKey.length <= rightKey.length ? rightKey : leftKey
  if (looksLikeCatalogToken(shorter) && longer.includes(shorter)) return true
  if (!left.bbox || !right.bbox) return false
  return lineEvidencePasses(left, right)
}

export function mergeOcrPasses(passes: OcrPassInput[]) {
  const lines: OcrMergedLine[] = []
  for (const pass of passes) {
    const passLines: OcrLineEvidence[] = pass.lines?.length ? pass.lines : pass.text.split(/\r?\n/).map((text) => ({ text: text.trim(), confidence: pass.confidence }))
    for (const evidence of passLines) {
      if (!evidence.text.trim()) continue
      const existing = lines.find((line) => sameMergedEvidence({ text: line.text, confidence: line.confidence, bbox: line.bbox }, evidence))
      if (!existing) {
        lines.push({ text: evidence.text.trim(), passes: [pass.id], confidence: evidence.confidence ?? pass.confidence, bbox: evidence.bbox })
        continue
      }
      if (evidence.text.trim().length > existing.text.trim().length) existing.text = evidence.text.trim()
      if (!existing.passes.includes(pass.id)) existing.passes.push(pass.id)
      existing.confidence = Math.max(existing.confidence ?? 0, evidence.confidence ?? pass.confidence ?? 0) || null
      existing.bbox ??= evidence.bbox
    }
  }
  const confidenceValues = lines.map((line) => line.confidence).filter((value): value is number => value !== null && Number.isFinite(value))
  return {
    lines,
    text: lines.map((line) => line.text).join('\n'),
    confidence: confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : null,
  }
}

function parseTsvLines(tsv: string | null, fallbackText: string, confidence: number | null): OcrLineEvidence[] {
  if (!tsv) return fallbackText.split(/\r?\n/).map((text) => ({ text: text.trim(), confidence })).filter((line) => line.text)
  const grouped = new Map<string, OcrLineEvidence>()
  tsv.split(/\r?\n/).slice(1).forEach((row) => {
    const columns = row.split('\t')
    if (columns.length < 12) return
    const text = columns.slice(11).join('\t').trim()
    if (!text) return
    const key = `${columns[2]}:${columns[3]}:${columns[4]}:${columns[5]}`
    const left = Number(columns[6])
    const top = Number(columns[7])
    const width = Number(columns[8])
    const height = Number(columns[9])
    const wordConfidence = Number(columns[10])
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, { text, confidence: Number.isFinite(wordConfidence) ? wordConfidence : confidence, bbox: { left, top, width, height } })
      return
    }
    current.text = `${current.text} ${text}`.trim()
    if (current.bbox) {
      const right = Math.max(current.bbox.left + current.bbox.width, left + width)
      const bottom = Math.max(current.bbox.top + current.bbox.height, top + height)
      current.bbox = { left: Math.min(current.bbox.left, left), top: Math.min(current.bbox.top, top), width: right - Math.min(current.bbox.left, left), height: bottom - Math.min(current.bbox.top, top) }
    }
  })
  return grouped.size ? [...grouped.values()] : parseTsvLines(null, fallbackText, confidence)
}

export async function recognizeProcessedInvoiceImage(source: string | Blob, options: OcrOptions = {}): Promise<OcrResult> {
  const { signal, onProgress, maxEdge = OCR_MAX_EDGE } = options
  throwIfAborted(signal)
  const preparedPasses = await prepareOcrPassImages(source, maxEdge)
  throwIfAborted(signal)

  const { createWorker, OEM } = await import('tesseract.js')
  throwIfAborted(signal)
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  let terminated = false
  const terminate = () => {
    if (!worker || terminated) return
    terminated = true
    void worker.terminate()
  }
  const abortListener = () => terminate()
  signal?.addEventListener('abort', abortListener, { once: true })

  try {
    worker = await createWorker('tha+eng', OEM.LSTM_ONLY, {
      ...OCR_ASSET_PATHS,
      workerBlobURL: false,
      gzip: true,
      cacheMethod: 'none',
      logger: (message) => onProgress?.({ status: progressStatus(message.status), progress: Math.max(0, Math.min(1, message.progress / OCR_PASS_CONFIG.length)) }),
    })
    throwIfAborted(signal)
    const passes: OcrPassResult[] = []
    for (const [index, prepared] of preparedPasses.entries()) {
      throwIfAborted(signal)
      const pass = prepared.pass
      const whitelist = 'whitelist' in pass ? pass.whitelist : ''
      await worker.setParameters({
        tessedit_pageseg_mode: pass.psm as unknown as import('tesseract.js').PSM,
        tessedit_char_whitelist: whitelist,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })
      onProgress?.({ status: pass.label, progress: index / OCR_PASS_CONFIG.length })
      const recognition = worker.recognize(prepared.image.blob, { rotateAuto: true }, { text: true, tsv: true })
      const result = signal
        ? await Promise.race([
          recognition,
          new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(abortError()), { once: true })),
        ])
        : await recognition
      throwIfAborted(signal)
      const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : null
      passes.push({ id: pass.id, label: pass.label, text: result.data.text, confidence, lines: parseTsvLines(result.data.tsv, result.data.text, confidence) })
      onProgress?.({ status: `${pass.label} เสร็จแล้ว`, progress: (index + 1) / OCR_PASS_CONFIG.length })
    }
    const merged = mergeOcrPasses(passes)
    return { text: merged.text, confidence: merged.confidence, preparedImage: preparedPasses[0].image, passes, lines: merged.lines }
  } finally {
    signal?.removeEventListener('abort', abortListener)
    if (!terminated) {
      terminated = true
      await worker?.terminate()
    }
  }
}
