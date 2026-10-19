import { getUser } from './api'

export type Request = { headers: Record<string, string>; userId?: string }
export type Next = () => string

const TOKENS: Record<string, string> = { 'token-ada': '1', 'token-linus': '2' }

export function requireAuth(req: Request, next: Next): string {
  const header = req.headers['authorization'] ?? ''
  const token = header.replace(/^Bearer /, '')
  const userId = TOKENS[token]
  if (!userId) return '401 Unauthorized'
  req.userId = userId

  return next()
}

export function requireAdmin(req: Request, next: Next): string {
  return requireAuth(req, () => {
    const user = getUser(req.userId ?? '')
    if (user?.role !== 'admin') return '403 Forbidden'

    return next()
  })
}
