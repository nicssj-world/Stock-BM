import 'server-only'
import type { BmActor } from '@/lib/bm/types'
import { HttpError } from '@/lib/server/errors'
import { getMySigner } from '@/lib/server/vendor-evaluation'

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/

/**
 * The signed-in user's own saved signature (bm_user_signers) as a PNG file,
 * ready to be stored as a signature attachment. It is read on the server from
 * the actor's own row, never accepted from the browser, so a saved signature
 * can only ever sign for the person who saved it.
 */
export async function getSavedSignatureFile(actor: BmActor): Promise<File> {
  const { signature } = await getMySigner(actor)
  const match = signature ? PNG_DATA_URL.exec(signature) : null
  if (!match) throw new HttpError(400, 'ยังไม่มีลายเซ็นที่บันทึกไว้ · ตั้งค่าได้ที่เมนู "ลายเซ็นของฉัน"')
  return new File([Buffer.from(match[1], 'base64')], 'signature.png', { type: 'image/png' })
}
