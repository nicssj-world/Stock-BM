import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { extractLineGroupIds, verifyLineWebhookSignature } from './webhook'

function sign(body: string, secret: string) {
  return createHmac('sha256', secret).update(body).digest('base64')
}

describe('LINE webhook helpers', () => {
  it('accepts the signature generated from the exact raw request body', () => {
    const body = '{"events":[]}'
    const secret = 'test-channel-secret'

    expect(verifyLineWebhookSignature(body, sign(body, secret), secret)).toBe(true)
  })

  it('rejects a signature when the body or secret is changed', () => {
    const body = '{"events":[]}'
    const secret = 'test-channel-secret'
    const signature = sign(body, secret)

    expect(verifyLineWebhookSignature(`${body} `, signature, secret)).toBe(false)
    expect(verifyLineWebhookSignature(body, signature, 'different-secret')).toBe(false)
    expect(verifyLineWebhookSignature(body, '', secret)).toBe(false)
  })

  it('extracts unique group IDs and ignores rooms and user messages', () => {
    expect(
      extractLineGroupIds({
        events: [
          {
            source: { type: 'group', groupId: 'C-group-1' },
            message: { type: 'text', text: 'patient HN 123' },
          },
          { source: { type: 'group', groupId: 'C-group-1' } },
          { source: { type: 'room', roomId: 'R-room-1' } },
          { source: { type: 'user', userId: 'U-user-1' } },
        ],
      }),
    ).toEqual(['C-group-1'])
  })
})
