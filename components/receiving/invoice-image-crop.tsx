'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { Camera, Check, Crop, Image as ImageIcon, RotateCcw, X } from 'lucide-react'
import { Button, Card, Notice, StatusBadge } from '@/components/ui'
import {
  beginCropDrag,
  calculateLoupeViewportPosition,
  clampCropPoint,
  detectDocumentCorners,
  type CropCorners,
  type CropPoint,
  type ImageSize,
  rectifyPerspectiveImage,
  resetCropCorners,
  endCropDrag,
  moveCropDrag,
  validatePerspectiveInput,
} from '@/lib/receiving/document-crop'

type CornerKey = keyof CropCorners

export type InvoiceImageCropResult = {
  originalImage: string
  cropCorners: CropCorners | null
  processedImage: string
  skipped: boolean
  /** Preview-only diagnostics (section M): original pixel dimensions and whether corners came from auto-detection. */
  imageSize: ImageSize | null
  autoDetected: boolean
}

const cornerKeys: CornerKey[] = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']
const cornerLabels: Record<CornerKey, string> = {
  topLeft: 'top-left',
  topRight: 'top-right',
  bottomRight: 'bottom-right',
  bottomLeft: 'bottom-left',
}
// The visible bracket is drawn once for the top-left corner (an "L" opening
// toward the inside of the quadrilateral) and rotated 90 degrees per corner
// going clockwise, rather than drawing four separate paths.
const cornerBracketRotation: Record<CornerKey, number> = {
  topLeft: 0,
  topRight: 90,
  bottomRight: 180,
  bottomLeft: 270,
}

export type DisplayedImageRect = {
  left: number
  top: number
  width: number
  height: number
  frameWidth: number
  frameHeight: number
}

export function calculateDisplayedImageRect(frame: DOMRect, imageSize: ImageSize): DisplayedImageRect {
  const scale = Math.min(frame.width / imageSize.width, frame.height / imageSize.height)
  const width = imageSize.width * scale
  const height = imageSize.height * scale
  return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height, frameWidth: frame.width, frameHeight: frame.height }
}

const FILE_INPUT_CLASS = 'absolute h-px w-px overflow-hidden opacity-0'
// Required while dragging a corner (real-iPhone acceptance): large enough to
// see the document edge around the crosshair, small enough not to hide most
// of the page. Kept well inside the requested 90-110px / 1.7-2.0x ranges.
const LOUPE_SIZE = 100
const LOUPE_MAGNIFICATION = 1.8
const LOUPE_GAP = 14

function isSupportedImageFile(file: File) {
  return file.type.toLowerCase().startsWith('image/') || /\.(?:heic|heif)$/i.test(file.name)
}

export function InvoiceImageCrop({ onConfirmed }: { onConfirmed?: (result: InvoiceImageCropResult) => void }) {
  const sourceImageRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [processedImage, setProcessedImage] = useState<string | null>(null)
  const [autoCorners, setAutoCorners] = useState<CropCorners | null>(null)
  const [cropCorners, setCropCorners] = useState<CropCorners | null>(null)
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [showOriginal, setShowOriginal] = useState(true)
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<CornerKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [displayedRect, setDisplayedRect] = useState<DisplayedImageRect | null>(null)
  const dragOffsetRef = useRef<{ key: string | null; pointerId: number | null; offset: CropPoint | null }>({ key: null, pointerId: null, offset: null })

  useEffect(() => {
    if (!imageSize || !frameRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const frame = frameRef.current
      if (frame) setDisplayedRect(calculateDisplayedImageRect(frame.getBoundingClientRect(), imageSize))
    })
    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [imageSize, originalImage])

  function chooseImage(file: File | null) {
    if (!file || !isSupportedImageFile(file)) {
      setError('กรุณาเลือกไฟล์ภาพ invoice')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const image = typeof reader.result === 'string' ? reader.result : null
      if (!image) {
        setError('อ่านไฟล์ภาพไม่สำเร็จ')
        return
      }
      setOriginalImage(image)
      setProcessedImage(null)
      setAutoCorners(null)
      setCropCorners(null)
      setImageSize(null)
      setShowOriginal(true)
      dragOffsetRef.current = { key: null, pointerId: null, offset: null }
      setDragging(null)
      setDetectionMessage('กำลังตรวจหาขอบเอกสาร…')
      setError(null)
    }
    reader.onerror = () => setError('อ่านไฟล์ภาพไม่สำเร็จ')
    reader.readAsDataURL(file)
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    if (!file) return
    chooseImage(file)
    event.currentTarget.value = ''
  }

  function onOriginalLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    sourceImageRef.current = image
    const size = { width: image.naturalWidth, height: image.naturalHeight }
    setImageSize(size)
    const detected = detectDocumentCorners(image)
    setAutoCorners(detected)
    setCropCorners(resetCropCorners(detected))
    setDetectionMessage(detected ? 'ตรวจพบขอบเอกสารอัตโนมัติ — ปรับมุมได้หากจำเป็น' : 'ไม่พบขอบเอกสารอัตโนมัติ — กรุณาปรับมุมทั้ง 4 ด้วยตนเอง')
  }

  function currentDisplayedImageRect() {
    const frame = frameRef.current?.getBoundingClientRect()
    if (!frame || !imageSize) return null
    return calculateDisplayedImageRect(frame, imageSize)
  }

  function pointerToNormalized(event: React.PointerEvent) {
    const rect = currentDisplayedImageRect()
    if (!rect) return null
    return clampCropPoint({
      x: Math.min(1, Math.max(0, (event.clientX - (frameRef.current?.getBoundingClientRect().left ?? 0) - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - (frameRef.current?.getBoundingClientRect().top ?? 0) - rect.top) / rect.height)),
    })
  }

  function framePercent(point: CropPoint, rect: DisplayedImageRect | null) {
    if (!rect) return { left: point.x * 100, top: point.y * 100 }
    return { left: ((rect.left + point.x * rect.width) / rect.frameWidth) * 100, top: ((rect.top + point.y * rect.height) / rect.frameHeight) * 100 }
  }

  function beginDrag(key: CornerKey, event: React.PointerEvent<HTMLButtonElement>) {
    const currentPoint = cropCorners?.[key]
    const pointer = pointerToNormalized(event)
    if (!currentPoint) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOffsetRef.current = beginCropDrag(key, event.pointerId, currentPoint, pointer ?? currentPoint)
    setDragging(key)
  }

  function moveDrag(key: CornerKey, event: React.PointerEvent<HTMLButtonElement>) {
    const activeDrag = dragOffsetRef.current
    if (!cropCorners || activeDrag.key !== key || activeDrag.pointerId !== event.pointerId) return
    event.preventDefault()
    const pointer = pointerToNormalized(event)
    if (!pointer) return
    const next = moveCropDrag(activeDrag, key, event.pointerId, pointer)
    if (!next) return
    setCropCorners((current) => current ? { ...current, [key]: next } : current)
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragOffsetRef.current.key !== null) event.preventDefault()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const activeKey = dragOffsetRef.current.key
    dragOffsetRef.current = endCropDrag(dragOffsetRef.current, activeKey ?? '', event.pointerId)
    setDragging(null)
  }

  function resetCorners() {
    setCropCorners(resetCropCorners(autoCorners))
    setError(null)
  }

  function skipCrop() {
    if (!originalImage) return
    setProcessedImage(originalImage)
    setShowOriginal(false)
    setError(null)
    onConfirmed?.({ originalImage, cropCorners: null, processedImage: originalImage, skipped: true, imageSize, autoDetected: false })
  }

  function confirmCrop() {
    if (!originalImage || !cropCorners || !imageSize || !sourceImageRef.current) return
    const validation = validatePerspectiveInput(cropCorners, imageSize)
    if (!validation.ok) {
      setError(validation.reason)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rectified = rectifyPerspectiveImage(sourceImageRef.current, cropCorners)
      setProcessedImage(rectified.dataUrl)
      setShowOriginal(false)
      onConfirmed?.({ originalImage, cropCorners, processedImage: rectified.dataUrl, skipped: false, imageSize, autoDetected: autoCorners !== null })
    } catch (rectifyError) {
      setError(rectifyError instanceof Error ? rectifyError.message : 'แก้ภาพ perspective ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const previewImage = showOriginal ? originalImage : processedImage ?? originalImage
  const framePoints = cropCorners ? cornerKeys.map((key) => framePercent(cropCorners[key], displayedRect)).map((point) => `${point.left},${point.top}`).join(' ') : ''

  // Required while actively dragging a corner (real-iPhone acceptance):
  // shows a magnified view of the ORIGINAL image around the exact crop
  // coordinate — not a screenshot of the crop UI — so the user can see both
  // the precise corner and enough surrounding document edge to place it.
  // Derived straight from existing state (dragging + cropCorners): it shows
  // exactly when a corner is being dragged and disappears the instant
  // dragging stops, with no separate state to keep in sync.
  const activeLoupe = dragging && cropCorners && imageSize && originalImage ? (() => {
    const point = cropCorners[dragging]
    const displayed = framePercent(point, displayedRect)
    const frameRect = frameRef.current?.getBoundingClientRect()
    if (!frameRect) return null
    const clientX = frameRect.left + (displayed.left / 100) * frameRect.width
    const clientY = frameRect.top + (displayed.top / 100) * frameRect.height
    const viewport = typeof window === 'undefined' ? { width: 390, height: 844 } : { width: window.innerWidth, height: window.innerHeight }
    const position = calculateLoupeViewportPosition({ x: clientX, y: clientY }, viewport, LOUPE_SIZE, LOUPE_GAP)
    return { point, position }
  })() : null

  return <Card className="space-y-3 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Invoice image capture</p><h3 className="mt-1 text-base font-bold text-[#173d50]">เตรียมภาพก่อน OCR</h3><p className="mt-1 text-xs leading-5 text-[#81979c]">ระบบจะไม่ส่งภาพต้นฉบับเข้า OCR จนกว่าจะยืนยัน crop หรือเลือก Skip Crop</p></div>{processedImage ? <StatusBadge tone="accepted" label="ยืนยันภาพสำหรับ OCR แล้ว" /> : originalImage ? <StatusBadge tone="warning" label="รอยืนยัน crop" /> : null}</div>
    <div className="flex flex-wrap gap-2" aria-label="เลือกหรือถ่ายภาพ invoice">
      <label htmlFor="invoice-image-library" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[#b8d8d5] bg-white px-3 py-2 text-sm font-semibold text-[#0b7f76] shadow-sm hover:bg-[#f4fbf9] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0b7f76]"><ImageIcon className="size-4" aria-hidden="true" />เลือกรูปจากคลังภาพ</label>
      <label htmlFor="invoice-image-camera" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-[#0b7f76] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#096b64] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#0b7f76]"><Camera className="size-4" aria-hidden="true" />ถ่ายรูปใหม่</label>
      <input id="invoice-image-library" type="file" accept="image/*" className={FILE_INPUT_CLASS} onChange={handleFileSelection} />
      <input id="invoice-image-camera" type="file" accept="image/*" capture="environment" className={FILE_INPUT_CLASS} onChange={handleFileSelection} />
    </div>
    {originalImage ? <>
      {detectionMessage ? <Notice tone={autoCorners ? 'info' : 'warning'}>{detectionMessage}</Notice> : null}
      {/*
        touch-action on the frame is a static "pan-y" — it never toggles.
        Each corner's own touch target below is statically touch-none instead
        (via the `touch-none` class, not an inline style flipped by React
        state). iOS Safari decides whether a touch gesture starts a page
        scroll from the touch-action value in effect at the moment the touch
        begins, before any of our event handlers run — flipping it reactively
        in a pointerdown handler is consistently too late on Safari. A static
        per-element value sidesteps that entirely: drags starting on a
        corner's touch target never scroll the page, and touches anywhere
        else on the frame still pan normally.
      */}
      <div ref={frameRef} className="relative aspect-[4/3] max-h-[70vh] min-h-[220px] touch-pan-y select-none overflow-hidden rounded-md border border-[#c9dadd] bg-[#eff4f4]">
        {previewImage ? <img src={previewImage} alt="Invoice preview" className="absolute inset-0 h-full w-full object-contain" style={{ imageOrientation: 'from-image' }} onLoad={showOriginal ? onOriginalLoad : undefined} /> : null}
        {showOriginal && cropCorners ? <>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={framePoints} fill="rgba(11,127,118,.10)" stroke="#0b7f76" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          </svg>
          {cornerKeys.map((key) => {
            const point = framePercent(cropCorners[key], displayedRect)
            const active = dragging === key
            return <Fragment key={key}>
              {/* Visible bracket: a small high-contrast "L" corner grip, not a large circle. Purely decorative — pointer-events-none — and kept well under the touch target below so it never covers invoice text. */}
              <svg
                aria-hidden="true"
                width="26"
                height="26"
                viewBox="0 0 26 26"
                className="pointer-events-none absolute z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,.65)]"
                style={{ left: `${point.left}%`, top: `${point.top}%`, transform: `translate(-50%, -50%) rotate(${cornerBracketRotation[key]}deg)` }}
              >
                <path d="M4 15V4H15" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 15V4H15" fill="none" stroke={active ? '#f5a623' : '#0b7f76'} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {/* Invisible 48px touch target, separate from the visible bracket so the grip itself can stay small. */}
              <button
                type="button"
                aria-label={`ลากมุม ${cornerLabels[key]}`}
                className="absolute z-20 size-12 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-0 bg-transparent p-0"
                style={{ left: `${point.left}%`, top: `${point.top}%` }}
                onPointerDown={(event) => beginDrag(key, event)}
                onPointerMove={(event) => moveDrag(key, event)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </Fragment>
          })}
        </> : null}
        {!showOriginal && processedImage ? <div className="absolute bottom-2 left-2 rounded-full bg-[#173d50]/85 px-2.5 py-1 text-[11px] font-semibold text-white">Preview corrected image</div> : null}
      </div>
      {activeLoupe && imageSize && originalImage ? <div
        aria-hidden="true"
        className="pointer-events-none fixed z-50 overflow-hidden rounded-full border-4 border-white bg-[#173d50] shadow-2xl"
        style={{
          left: activeLoupe.position.left,
          top: activeLoupe.position.top,
          width: LOUPE_SIZE,
          height: LOUPE_SIZE,
          backgroundImage: `url(${originalImage})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${imageSize.width * LOUPE_MAGNIFICATION}px ${imageSize.height * LOUPE_MAGNIFICATION}px`,
          backgroundPosition: `${LOUPE_SIZE / 2 - activeLoupe.point.x * imageSize.width * LOUPE_MAGNIFICATION}px ${LOUPE_SIZE / 2 - activeLoupe.point.y * imageSize.height * LOUPE_MAGNIFICATION}px`,
          imageOrientation: 'from-image',
        }}
      >
        <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/80" />
        <span className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/80" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-500 bg-white/30" />
      </div> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={resetCorners}><RotateCcw className="size-4" />ใช้ Auto Crop / Reset corners</Button>{processedImage ? <Button type="button" variant="secondary" onClick={() => setShowOriginal((current) => !current)}>{showOriginal ? <ImageIcon className="size-4" /> : <Crop className="size-4" />}{showOriginal ? 'Preview corrected image' : 'Original image'}</Button> : null}<Button type="button" variant="ghost" disabled={busy} onClick={skipCrop}><X className="size-4" />Skip Crop</Button><Button type="button" disabled={busy || !cropCorners} onClick={confirmCrop}><Check className="size-4" />Confirm Crop</Button></div>
    </> : null}
  </Card>
}
