'use client'

export const OCR_MAX_EDGE = 1600

export const OCR_ASSET_PATHS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/tesseract-core-lstm.wasm.js',
  langPath: '/ocr/lang-data',
} as const

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

export type OcrResult = {
  text: string
  confidence: number | null
  preparedImage: PreparedOcrImage
}

export type OcrOptions = {
  signal?: AbortSignal
  onProgress?: (progress: OcrProgress) => void
  maxEdge?: number
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

export async function prepareOcrImage(source: string | Blob, maxEdge = OCR_MAX_EDGE): Promise<PreparedOcrImage> {
  if (typeof document === 'undefined') throw new Error('OCR image preparation requires a browser')
  const image = await loadImage(source)
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
  return {
    blob: await canvasBlob(canvas),
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    width: size.width,
    height: size.height,
  }
}

function progressStatus(status: string) {
  if (status === 'initializing tesseract') return 'กำลังโหลด OCR engine'
  if (status === 'loading language traineddata') return 'กำลังโหลดภาษาไทยและอังกฤษ'
  if (status === 'initializing api') return 'กำลังเตรียม OCR'
  if (status === 'recognizing text') return 'กำลังอ่านข้อความ'
  return status
}

export async function recognizeProcessedInvoiceImage(source: string | Blob, options: OcrOptions = {}): Promise<OcrResult> {
  const { signal, onProgress, maxEdge = OCR_MAX_EDGE } = options
  throwIfAborted(signal)
  const preparedImage = await prepareOcrImage(source, maxEdge)
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
      logger: (message) => onProgress?.({ status: progressStatus(message.status), progress: Math.max(0, Math.min(1, message.progress)) }),
    })
    throwIfAborted(signal)
    const recognition = worker.recognize(preparedImage.blob, { rotateAuto: true }, { text: true })
    const result = signal
      ? await Promise.race([
        recognition,
        new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(abortError()), { once: true })),
      ])
      : await recognition
    throwIfAborted(signal)
    return { text: result.data.text, confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null, preparedImage }
  } finally {
    signal?.removeEventListener('abort', abortListener)
    if (!terminated) {
      terminated = true
      await worker?.terminate()
    }
  }
}
