import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Pin Turbopack's workspace root to this project — avoids picking up stray
  // lockfiles in parent directories.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
