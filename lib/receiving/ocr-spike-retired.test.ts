import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.next', '.git'].includes(entry.name)) return []
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|json)$/.test(entry.name) ? [path] : []
  })
}

describe('retired OCR feasibility spike', () => {
  it('leaves no runtime or package references to the retired spike', () => {
    const tokens = [
      ['ocr', '-test'],
      ['ocr-rapid', '-loader'],
      ['ocr', '-', 'opencv'],
      ['ocr', '-', 'ort'],
      ['@paddleocr', '/', 'paddleocr-js'],
    ].map((parts) => parts.join(''))
    const matches = sourceFiles(process.cwd()).flatMap((file) => {
      const source = readFileSync(file, 'utf8').toLowerCase()
      return tokens.filter((token) => source.includes(token)).map((token) => `${relative(process.cwd(), file)}: ${token}`)
    })
    expect(matches).toEqual([])
  })
})
