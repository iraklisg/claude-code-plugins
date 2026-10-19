import { getUser } from './api'
import { requireAdmin, requireAuth, type Request } from './auth'

export function showProfile(req: Request): string {
  return requireAuth(req, () => getUser(req.userId ?? '')?.name ?? '404 Not Found')
}

export function showAdminPanel(req: Request): string {
  return requireAdmin(req, () => `Admin panel for ${getUser(req.userId ?? '')?.name}`)
}
