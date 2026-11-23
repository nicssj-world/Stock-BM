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

  it('keeps signers on EQA or their own signature page', () => {
    expect(loginRedirectPath('Signer', '/inventory')).toBe('/eqa')
    expect(loginRedirectPath('Signer', null)).toBe('/eqa')
    expect(loginRedirectPath('Signer', '/eqa/report/annual-plan/abc')).toBe('/eqa/report/annual-plan/abc')
    expect(loginRedirectPath('Signer', '/my-signature')).toBe('/my-signature')
    expect(loginRedirectPath('Signer', '/eqa-evil')).toBe('/eqa')
  })
})
