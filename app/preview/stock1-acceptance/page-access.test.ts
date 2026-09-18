import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

import Stock1PreviewAcceptancePage from './page'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Stock1 preview acceptance route access gate', () => {
  it('renders without Supabase auth only in Preview with the explicit flag enabled', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('STOCK1_PREVIEW_ACCEPTANCE_MODE', 'true')
    vi.stubEnv('NODE_ENV', 'production')

    expect(Stock1PreviewAcceptancePage()).toBeTruthy()
  })

  it('is inaccessible when the acceptance flag is disabled', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('STOCK1_PREVIEW_ACCEPTANCE_MODE', 'false')
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => Stock1PreviewAcceptancePage()).toThrow('NOT_FOUND')
  })

  it('is inaccessible in Production even if the acceptance flag is enabled', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('STOCK1_PREVIEW_ACCEPTANCE_MODE', 'true')
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => Stock1PreviewAcceptancePage()).toThrow('NOT_FOUND')
  })

  it('does not treat local development as a Preview deployment', () => {
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('STOCK1_PREVIEW_ACCEPTANCE_MODE', 'true')
    vi.stubEnv('NODE_ENV', 'development')

    expect(() => Stock1PreviewAcceptancePage()).toThrow('NOT_FOUND')
  })
})
