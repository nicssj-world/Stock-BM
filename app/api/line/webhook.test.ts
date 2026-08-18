import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from './webhook/route'

const secret = 'test-channel-secret'

function sign(body: string) {
  return createHmac('sha256', secret).update(body).digest('base64')
}

describe('LINE webhook route', () => {
  const originalSecret = process.env.LINE_CHANNEL_SECRET

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalSecret === undefined) delete process.env.LINE_CHANNEL_SECRET
    else process.env.LINE_CHANNEL_SECRET = originalSecret
  })

  it('rejects requests with an invalid LINE signature', async () => {
    process.env.LINE_CHANNEL_SECRET = secret

    const response = await POST(
      new Request('https://example.test/api/line/webhook', {
        method: 'POST',
        headers: { 'x-line-signature': 'invalid' },
        body: '{"events":[]}',
      }),
    )

    expect(response.status).toBe(401)
  })

  it('returns success and logs only the group ID for a valid event', async () => {
    process.env.LINE_CHANNEL_SECRET = secret
    const body = JSON.stringify({
      events: [
        {
          source: { type: 'group', groupId: 'C-group-1' },
          message: { type: 'text', text: 'patient HN 123' },
        },
      ],
    })
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})

    const response = await POST(
      new Request('https://example.test/api/line/webhook', {
        method: 'POST',
        headers: { 'x-line-signature': sign(body) },
        body,
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(log).toHaveBeenCalledWith('LINE_GROUP_ID_CANDIDATES', ['C-group-1'])
    expect(JSON.stringify(log.mock.calls)).not.toContain('patient HN 123')
  })
})
