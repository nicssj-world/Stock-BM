import type { MetadataRoute } from 'next'

// PWA manifest so staff can "Add to Home Screen" and open the app full-screen on
// mobile (used for fast QR-driven temperature logging at the bench).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'Molecular-CBH QMS',
    short_name: 'CBH QMS',
    description: 'Molecular laboratory quality management system (Stock, IQC, EQA, Monitoring) for Chonburi Hospital.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui', 'browser'],
    orientation: 'portrait',
    background_color: '#eef4f3',
    theme_color: '#123944',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
