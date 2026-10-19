import { describe, expect, it } from 'vitest'
import { getUser } from './api'

describe('getUser', () => {
  it('finds a user by id', () => {
    expect(getUser('1')?.name).toBe('Ada')
  })
})
