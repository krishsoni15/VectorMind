import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { useEffect } from 'react'
import { AuthProvider } from '@/lib/AuthContext'

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
          (reg) => console.log('VectorMind ServiceWorker registered: ', reg.scope),
          (err) => console.log('VectorMind ServiceWorker registration failed: ', err)
        )
      })
    }
  }, [])

  return (
    <AuthProvider>
      <Head>
        <title>VectorMind — Hybrid RAG &amp; CAG Document Intelligence Platform</title>
        <meta name="application-name" content="VectorMind" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VectorMind" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#10b981" />
        <link rel="icon" type="image/svg+xml" href="/vectormind-icon.svg" />
        <link rel="shortcut icon" href="/vectormind-icon.svg" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/vectormind-icon.svg" />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  )
}

