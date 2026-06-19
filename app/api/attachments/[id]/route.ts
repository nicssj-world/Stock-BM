import { requireActor } from '@/lib/server/auth'
import { deleteAttachment, signedUrl } from '@/lib/server/attachments'
import { HttpError } from '@/lib/server/errors'
import { respond } from '@/lib/server/route'

// GET returns a short-lived signed URL and redirects to it for download.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireActor()
    const url = await signedUrl((await params).id)
    return Response.redirect(url, 302)
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status })
    return Response.json({ error: error instanceof Error ? error.message : 'Unexpected error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const actor = await requireActor()
    await deleteAttachment((await params).id, actor)
    return { ok: true }
  })
}
