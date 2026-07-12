import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // 最大50MBまでアップロードを許可
    },
  },
  reactCompiler: true,
};

export default nextConfig;
