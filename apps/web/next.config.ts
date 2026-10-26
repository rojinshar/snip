import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

// Makes Cloudflare bindings available to `next dev`; no-op in production builds.
void initOpenNextCloudflareForDev();
