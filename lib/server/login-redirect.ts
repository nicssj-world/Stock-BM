export function loginRedirectPath(role: string, nextPath: string | null) {
  if (role === 'Assistant') return '/hpv'
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) return '/dashboard'
  return nextPath
}
