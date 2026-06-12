import type { Metadata } from 'next'
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/600.css'
import '@fontsource/noto-sans-thai/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stock-BM | Chonburi Hospital',
  description: 'Molecular biology reagent and consumable stock workspace for Chonburi Hospital.',
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
