/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'

const nextConfig = {
  reactStrictMode: false,
  async headers() {
    // Skip CSP headers in development — they block Next.js HMR/Fast Refresh
    if (isDev) return []

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; frame-src 'self' https://*.supabase.co; connect-src 'self' ws: wss: ws://localhost:* ws://127.0.0.1:* http://localhost:* https://*.supabase.co https://*.supabase.net https://generativelanguage.googleapis.com https://api.cohere.com https://api.openai.com https://api.groq.com https://*.upstash.io;",
          },
        ],
      },
    ]
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      '@napi-rs/canvas': false,
    }
    if (isServer) {
      config.externals = [...(config.externals || []), '@napi-rs/canvas']
    }
    return config
  },
}

module.exports = nextConfig
