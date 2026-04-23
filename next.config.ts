import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Phase 3 PUB-05: clinic logos can be set to any HTTPS URL by the owner.
  // We render them with `unoptimized` (bypassing Next's image optimizer) since
  // per-clinic allowlisting isn't viable for a SaaS. Malicious owners attacking
  // their own public page is not a v1 threat.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // Pin Turbopack's workspace root to this project — avoids picking up stray
  // lockfiles in parent directories.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
