import { notFound } from 'next/navigation'
import { Stock1PreviewAcceptance } from '@/components/receiving/stock1-preview-acceptance'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Stock1 Preview Acceptance',
  robots: { index: false, follow: false },
}

export default function Stock1PreviewAcceptancePage() {
  const enabled = process.env.STOCK1_PREVIEW_ACCEPTANCE_MODE === 'true'
    && (process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development')
  if (!enabled) notFound()
  return <Stock1PreviewAcceptance />
}
