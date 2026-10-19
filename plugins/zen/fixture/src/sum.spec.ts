import { describe, expect, it } from 'vitest'
import { sum } from './sum'

describe('sum', () => {
  it('adds positives', () => {
    expect(sum(1, 2)).toBe(3)
  })

  it('adds negatives', () => {
    expect(sum(-1, -2)).toBe(-3)
  })
})
