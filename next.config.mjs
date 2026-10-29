/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [{ source: "/demo/flujo", destination: "/demo/flow", permanent: false }]
  },
}

export default nextConfig
