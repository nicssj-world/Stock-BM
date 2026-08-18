import {
  extractLineGroupIds,
  verifyLineWebhookSignature,
} from '@/lib/line/webhook'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-line-signature') ?? ''
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim() ?? ''

  if (!verifyLineWebhookSignature(body, signature, channelSecret)) {
    return Response.json({ error: 'Invalid LINE webhook signature' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const groupIds = extractLineGroupIds(payload)
  if (groupIds.length > 0) {
    console.info('LINE_GROUP_ID_CANDIDATES', groupIds)
  }

  return Response.json({ ok: true })
}
