import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig, { serviceWorkerContentSecurityPolicy, supabaseOrigin } from './next.config'

afterEach(() => vi.unstubAllEnvs())

describe('service worker security headers', () => {
  it('allows worker fetches to the configured Supabase origin only', () => {
    expect(serviceWorkerContentSecurityPolicy('https://storage.example.test/project/')).toBe(
      "default-src 'self'; script-src 'self'; connect-src 'self' https://storage.example.test",
    )
  })

  it('rejects malformed Supabase configuration without widening the policy', () => {
    expect(supabaseOrigin('not a URL')).toBeNull()
    expect(serviceWorkerContentSecurityPolicy('not a URL')).toBe(
      "default-src 'self'; script-src 'self'; connect-src 'self'",
    )
  })

  it('emits the policy on the /sw.js header rule', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test')
    const rules = await nextConfig.headers?.()
    const serviceWorkerRule = rules?.find((rule) => rule.source === '/sw.js')
    const csp = serviceWorkerRule?.headers.find((header) => header.key === 'Content-Security-Policy')
    expect(csp?.value).toBe(serviceWorkerContentSecurityPolicy())
    expect(csp?.value).toContain('connect-src \'self\' https://storage.example.test')
  })
})
