'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ScannerControls = { stop: () => void }

function cameraErrorMessage(error: unknown) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'ต้องเปิดผ่าน HTTPS หรือ localhost จึงจะใช้กล้องได้'
  }
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : 'เปิดกล้องไม่ได้'
  }
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'เบราว์เซอร์ไม่อนุญาตใช้กล้อง กรุณากด Allow ใน permission'
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'ไม่พบกล้องที่ใช้งานได้บนเครื่องนี้'
  if (error.name === 'NotReadableError') return 'กล้องถูกใช้งานอยู่โดยแอปอื่น หรือระบบไม่ให้เข้าถึง'
  return error.message || 'เปิดกล้องไม่ได้'
}

export function useCameraScanner({
  onScan,
  onError,
  stopOnScan = false,
  dedupeMs = 1500,
}: {
  onScan: (code: string) => void
  onError: (message: string) => void
  stopOnScan?: boolean
  dedupeMs?: number
}) {
  const [cameraOn, setCameraOn] = useState(false)
  const [starting, setStarting] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<ScannerControls | null>(null)
  const lastRef = useRef({ code: '', at: 0 })
  const onScanRef = useRef(onScan)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onScanRef.current = onScan
    onErrorRef.current = onError
  }, [onError, onScan])

  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStarting(false)
    setCameraOn(false)
  }, [])

  const start = useCallback(async () => {
    if (cameraOn || starting) return
    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current('เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง')
      return
    }
    setStarting(true)
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      setCameraOn(true)
    } catch (error) {
      onErrorRef.current(cameraErrorMessage(error))
      setStarting(false)
    }
  }, [cameraOn, starting])

  const toggle = useCallback(() => {
    if (cameraOn || starting) stop()
    else void start()
  }, [cameraOn, start, starting, stop])

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return
    let cancelled = false
    async function attachAndDecode() {
      const video = videoRef.current
      const stream = streamRef.current
      if (!video || !stream) return
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      await video.play().catch(() => undefined)
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      controlsRef.current = await reader.decodeFromStream(stream, video, (result) => {
        const code = result?.getText().trim() ?? ''
        if (!code || cancelled) return
        const now = Date.now()
        if (code === lastRef.current.code && now - lastRef.current.at < dedupeMs) return
        lastRef.current = { code, at: now }
        onScanRef.current(code)
        if (stopOnScan) stop()
      })
      setStarting(false)
    }
    attachAndDecode().catch((error) => {
      if (!cancelled) {
        onErrorRef.current(cameraErrorMessage(error))
        stop()
      }
    })
    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [cameraOn, dedupeMs, stop, stopOnScan])

  useEffect(() => stop, [stop])

  return { cameraOn, starting, start, stop, toggle, videoRef }
}
