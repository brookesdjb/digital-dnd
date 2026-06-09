import type { Metadata } from 'next'
import { Manrope, Space_Mono } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
})

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'D&D Table',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'D&D Table',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const supabaseKey = process.env.SUPABASE_ANON_KEY ?? ''
  return (
    <html lang="en" className={`${manrope.variable} ${spaceMono.variable}`}>
      <head>
        {/* Inject runtime config — avoids NEXT_PUBLIC_ build-time bake-in */}
        <script dangerouslySetInnerHTML={{
          __html: `window.__SUPABASE_URL__=${JSON.stringify(supabaseUrl)};window.__SUPABASE_ANON_KEY__=${JSON.stringify(supabaseKey)};`
        }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
