import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.next', '.git', '.vercel'].includes(entry.name)) return []
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|json|mjs|js)$/.test(entry.name) ? [path] : []
  })
}

// Tokens are assembled from parts so this guard never matches itself.
const token = (...parts: string[]) => parts.join('')

describe('OCR removed from Stock1 scope', () => {
  it('leaves no runtime or package references to the retired OCR feasibility spike', () => {
    const tokens = [
      token('ocr', '-test'),
      token('ocr-rapid', '-loader'),
      token('ocr', '-', 'opencv'),
      token('ocr', '-', 'ort'),
      token('@paddleocr', '/', 'paddleocr-js'),
    ]
    const matches = sourceFiles(process.cwd()).flatMap((file) => {
      const source = readFileSync(file, 'utf8').toLowerCase()
      return tokens.filter((item) => source.includes(item)).map((item) => `${relative(process.cwd(), file)}: ${item}`)
    })
    expect(matches).toEqual([])
  })

  it('leaves no invoice OCR, auto document detection, or perspective crop runtime code outside historical migrations', () => {
    const tokens = [
      token('tesser', 'act'),
      token('trained', 'data'),
      token('invoice', '-ocr'),
      token('ocr', '-worker'),
      token('receiving', '/ocr'),
      token('document', '-crop'),
      token('detectDocument', 'Corners'),
      token('rectifyPerspective', 'Image'),
      token('bm_ocr', '_'),
    ].map((item) => item.toLowerCase())
    const matches = sourceFiles(process.cwd())
      .filter((file) => !relative(process.cwd(), file).startsWith(`supabase${sep}`) && !/\.test\.tsx?$/.test(file))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8').toLowerCase()
        return tokens.filter((item) => source.includes(item)).map((item) => `${relative(process.cwd(), file)}: ${item}`)
      })
    expect(matches).toEqual([])
  })
})
