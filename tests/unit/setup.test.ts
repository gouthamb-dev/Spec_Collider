import { describe, it, expect } from 'vitest'

describe('Project Setup', () => {
  it('vitest is configured and running', () => {
    expect(true).toBe(true)
  })

  it('can import fast-check', async () => {
    const fc = await import('fast-check')
    expect(fc.assert).toBeDefined()
  })
})
