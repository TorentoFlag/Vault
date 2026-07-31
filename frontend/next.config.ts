import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Backend-owned catalog routes need runtime rendering.
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: "",
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
