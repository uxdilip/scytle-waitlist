import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ['tailwindcss'],
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/tailwindcss/**/*'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
