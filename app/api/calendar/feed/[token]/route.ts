import { buildFeedForToken } from '@/lib/server/calendar'

// Public by design: phone calendar apps cannot log in, so the secret token in the URL is the credential.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, '')
  const query = new URL(request.url).searchParams
  const scope = query.get('scope') === 'team' ? 'team' : 'mine'
  try {
    const body = await buildFeedForToken(token, scope, query.get('calendar'))
    if (!body) return new Response('Not found', { status: 404 })
    return new Response(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="molecular-cbh-calendar.ics"',
        'Cache-Control': 'private, max-age=900',
        'X-Robots-Tag': 'noindex',
      },
    })
  } catch {
    return new Response('Calendar unavailable', { status: 503 })
  }
}
