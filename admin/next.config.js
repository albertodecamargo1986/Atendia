/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

module.exports = nextConfig;
