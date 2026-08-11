import { createHmac, timingSafeEqual } from 'node:crypto'

type LineWebhookSource = {
  type?: string
  groupId?: string
}

type LineWebhookEvent = {
  source?: LineWebhookSource
}

export type LineWebhookPayload = {
  events?: LineWebhookEvent[]
}

export function verifyLineWebhookSignature(
  body: string,
  signature: string,
  channelSecret: string,
) {
  if (!signature || !channelSecret) return false

  const expected = createHmac('sha256', channelSecret)
    .update(body, 'utf8')
    .digest('base64')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const actualBuffer = Buffer.from(signature, 'utf8')

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  )
}

export function extractLineGroupIds(payload: unknown) {
  if (!payload || typeof payload !== 'object') return []

  const events = (payload as LineWebhookPayload).events
  if (!Array.isArray(events)) return []

  return [
    ...new Set(
      events
        .filter(
          (event) =>
            event?.source?.type === 'group' &&
            typeof event.source.groupId === 'string' &&
            event.source.groupId.length > 0,
        )
        .map((event) => event.source!.groupId!),
    ),
  ]
}
