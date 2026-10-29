import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { fontVariables } from '@/lib/fonts'
import '../globals.css'

export const metadata: Metadata = {
  title: 'grinflow — coordination layer for food rescue',
  description:
    'a donor writes or sends a photo to grinflow on whatsapp, or scans the grinflow qr. grinflow handles the rest.',
  generator: 'v0.app',
  icons: {
    icon: '/grinflow-icon.svg',
  },
}

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
      </body>
    </html>
  )
}
