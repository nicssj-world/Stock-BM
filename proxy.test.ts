import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, proxy } from './proxy'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Stock1 preview acceptance proxy boundary', () => {
  it('matches only the dedicated acceptance route in addition to protected application routes', () => {
    expect(config.matcher).toContain('/preview/stock1-acceptance')
  })

  it('does not require Supabase authentication for the enabled Preview acceptance route', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('STOCK1_PREVIEW_ACCEPTANCE_MODE', 'true')
    vi.stubEnv('NEXT_PUBLIC_BM_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_BM_SUPABASE_ANON_KEY', '')

    const response = await proxy(new NextRequest('https://stock-bm.example/preview/stock1-acceptance'))

    expect(response.headers.get('location')).toBeNull()
  })

  it('keeps the normal receiving route behind Supabase authentication', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('STOCK1_PREVIEW_ACCEPTANCE_MODE', 'true')
    vi.stubEnv('NEXT_PUBLIC_BM_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_BM_SUPABASE_ANON_KEY', '')

    const response = await proxy(new NextRequest('https://stock-bm.example/receiving'))

    expect(response.headers.get('location')).toContain('/login')
  })
})
