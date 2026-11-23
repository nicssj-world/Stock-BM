export function loginRedirectPath(role: string, nextPath: string | null) {
  if (role === 'Assistant') return '/hpv'
  // A Signer may only open EQA and their own signature page.
  if (role === 'Signer') return nextPath && /^\/(eqa|my-signature)(\/|$|\?)/.test(nextPath) ? nextPath : '/eqa'
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) return '/dashboard'
  return nextPath
}
