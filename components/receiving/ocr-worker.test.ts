import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OCR_MAX_EDGE, OCR_ASSET_PATHS, OCR_PASS_CONFIG, downscaledImageSize, mergeOcrPasses } from './ocr-worker'

const workerSource = readFileSync(join(process.cwd(), 'components/receiving/ocr-worker.ts'), 'utf8')

describe('self-hosted invoice OCR worker boundary', () => {
  it('keeps the longest image edge at or below the iPhone-safe limit without upscaling', () => {
    expect(downscaledImageSize(4000, 2000)).toEqual({ width: 1600, height: 800 })
    expect(downscaledImageSize(800, 1200)).toEqual({ width: 800, height: 1200 })
    expect(downscaledImageSize(0, 1200)).toEqual({ width: 0, height: 0 })
    expect(OCR_MAX_EDGE).toBe(1600)
  })

  it('uses only same-origin self-hosted worker, core, and language paths', () => {
    expect(OCR_ASSET_PATHS.workerPath).toBe('/ocr/worker.min.js')
    expect(OCR_ASSET_PATHS.corePath).toBe('/ocr/tesseract-core-lstm.wasm.js')
    expect(OCR_ASSET_PATHS.langPath).toBe('/ocr/lang-data')
    expect(workerSource).not.toContain('cdn.jsdelivr.net')
    expect(workerSource).not.toContain('esm.sh')
  })

  it('ships the worker, core, wasm, and both language assets locally', () => {
    const assets = [
      'public/ocr/worker.min.js',
      'public/ocr/tesseract-core-lstm.wasm.js',
      'public/ocr/tesseract-core-lstm.wasm',
      'public/ocr/lang-data/eng.traineddata.gz',
      'public/ocr/lang-data/tha.traineddata.gz',
    ]
    for (const asset of assets) {
      expect(existsSync(join(process.cwd(), asset))).toBe(true)
      expect(statSync(join(process.cwd(), asset)).size).toBeGreaterThan(1024)
    }
    expect(readFileSync(join(process.cwd(), 'public/ocr/lang-data/eng.traineddata.gz')).subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
    expect(readFileSync(join(process.cwd(), 'public/ocr/lang-data/tha.traineddata.gz')).subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
  })

  it('exposes progress and cancellation and does not contain stock mutation calls', () => {
    expect(workerSource).toContain('onProgress')
    expect(workerSource).toContain('AbortSignal')
    expect(workerSource).toContain('worker.terminate')
    expect(workerSource).not.toMatch(/receive_bm_stock|issue_bm_stock|adjust_bm_stock|\.rpc\(/)
  })

  it('runs three conservative browser-only passes and merges duplicate lines with pass evidence', () => {
    expect(OCR_PASS_CONFIG.map((pass) => pass.id)).toEqual(['full', 'line_items', 'numeric'])
    expect(workerSource).toContain('worker.recognize')
    expect(workerSource).toContain('tessedit_char_whitelist')
    const merged = mergeOcrPasses([
      { id: 'full', text: '101154997 reagent\n090998877 reagent', confidence: 82 },
      { id: 'line_items', text: '101154997 reagent\n090998877 reagent', confidence: 91 },
      { id: 'numeric', text: '101154997', confidence: 76 },
    ])
    expect(merged.lines.map((line) => line.text)).toEqual(['101154997 reagent', '090998877 reagent'])
    expect(merged.lines[0].passes).toEqual(['full', 'line_items', 'numeric'])
    expect(merged.lines[1].passes).toEqual(['full', 'line_items'])
    expect(merged.text).toBe('101154997 reagent\n090998877 reagent')
  })
})
