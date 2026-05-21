/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
