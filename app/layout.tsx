import type { Metadata, Viewport } from 'next'
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/600.css'
import '@fontsource/noto-sans-thai/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Molecular-CBH QMS | Chonburi Hospital',
  description: 'Molecular laboratory quality management system (Stock, IQC, EQA, Monitoring) for Chonburi Hospital.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CBH QMS' },
}

export const viewport: Viewport = {
  themeColor: '#123944',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full bg-[#eef4f3] text-[#173d50]">{children}</body>
    </html>
  )
}
