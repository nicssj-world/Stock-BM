import { describe, expect, it } from 'vitest'
import { loginRedirectPath } from './login-redirect'

describe('loginRedirectPath', () => {
  it('returns a safe requested path for non-assistant roles', () => {
    expect(loginRedirectPath('Staff', '/inventory')).toBe('/inventory')
  })

  it('falls back to the dashboard for an unsafe requested path', () => {
    expect(loginRedirectPath('Staff', '//untrusted.example')).toBe('/dashboard')
  })

  it('always sends assistants to the HPV workspace', () => {
    expect(loginRedirectPath('Assistant', '/inventory')).toBe('/hpv')
  })
})
