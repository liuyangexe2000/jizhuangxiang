/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // mysql2 仅服务端使用，避免被误打进浏览器包
  serverExternalPackages: ["mysql2"],
}

export default nextConfig
