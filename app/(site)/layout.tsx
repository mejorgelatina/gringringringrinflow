import React from "react"
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { fontVariables } from '@/lib/fonts'
import '../globals.css'
import { PwaShell } from '../pwa-shell'

export const metadata: Metadata = {
  title: 'grinflow — coordination layer for food rescue',
  description:
    'a donor writes or sends a photo to grinflow on whatsapp, or scans the grinflow qr. grinflow handles the rest.',
  generator: 'v0.app',
  appleWebApp: { capable: true, title: 'grinflow', statusBarStyle: 'default' },
  icons: {
    icon: '/grinflow-icon.svg',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = { themeColor: '#10211d' }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${fontVariables} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
        <PwaShell />
      </body>
    </html>
  )
}
