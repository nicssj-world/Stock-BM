import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BmActor } from '@/lib/bm/types'

vi.mock('server-only', () => ({}))
const getMySigner = vi.fn()
vi.mock('@/lib/server/vendor-evaluation', () => ({ getMySigner: (...args: unknown[]) => getMySigner(...args) }))

const { getSavedSignatureFile } = await import('@/lib/server/user-signature')
const actor = { id: 'user-1', role: 'Staff', displayName: 'Somchai' } as unknown as BmActor
// 1x1 transparent PNG
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('getSavedSignatureFile', () => {
  beforeEach(() => getMySigner.mockReset())

  it("returns the signed-in user's own saved signature as a PNG file", async () => {
    getMySigner.mockResolvedValue({ position: null, signature: `data:image/png;base64,${PNG_BASE64}` })
    const file = await getSavedSignatureFile(actor)
    expect(getMySigner).toHaveBeenCalledWith(actor)
    expect(file.type).toBe('image/png')
    const bytes = new Uint8Array(await file.arrayBuffer())
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('refuses when nothing is saved or the stored value is not a PNG data URL', async () => {
    getMySigner.mockResolvedValue({ position: null, signature: null })
    await expect(getSavedSignatureFile(actor)).rejects.toThrow('ยังไม่มีลายเซ็นที่บันทึกไว้')
    getMySigner.mockResolvedValue({ position: null, signature: 'data:image/svg+xml;base64,PHN2Zy8+' })
    await expect(getSavedSignatureFile(actor)).rejects.toThrow('ยังไม่มีลายเซ็นที่บันทึกไว้')
  })
})

describe('saved signatures only sign for their owner', () => {
  const eqa = readFileSync(join(process.cwd(), 'lib/server/eqa.ts'), 'utf8')
  const eqaRoute = readFileSync(join(process.cwd(), 'app/api/eqa/documents/[type]/[id]/approvals/route.ts'), 'utf8')
  const equipmentRoute = readFileSync(join(process.cwd(), 'app/api/equipment/records/route.ts'), 'utf8')

  it('EQA rejects a saved signature for a role assigned to someone else (Admin included)', () => {
    expect(eqa).toContain('if (input.useSavedSignature && assignedSignerId && assignedSignerId !== actor.id) throw new HttpError(403')
    expect(eqa).toContain('assignedSignerId = round.analystId')
    expect(eqa).toContain('assignedSignerId = assignment?.userId ?? null')
  })

  it('EQA signs a saved signature in the assigned or own name and reads it on the server', () => {
    expect(eqa).toContain('? assignedSignerName ?? actor.displayName')
    expect(eqa).toContain('input.useSavedSignature ? await getSavedSignatureFile(actor) : input.signature!')
    expect(eqa).toContain("signatureSource: input.useSavedSignature ? 'saved' : 'drawn'")
    // The route never trusts an uploaded file as "the saved signature".
    expect(eqaRoute).toContain("const useSavedSignature = text(form, 'useSavedSignature') === '1'")
    expect(eqaRoute).toContain("if (!useSavedSignature && !(signature instanceof File))")
  })

  it('equipment uses the saved signature only for the signed-in receiver, in their own name', () => {
    expect(equipmentRoute).toContain('const receiverUsesSaved = receiverIsMe && values.receiverUseSavedSignature === "1"')
    expect(equipmentRoute).toContain('if (receiverIsMe) values.receiverName = actor.displayName')
    expect(equipmentRoute).toContain('receiverUsesSaved ? await getSavedSignatureFile(actor) : form.get("receiverSignature")')
    // The technician (usually external) always signs by drawing.
    expect(equipmentRoute).toContain('const technicianSignature = form.get("technicianSignature")')
  })
})
