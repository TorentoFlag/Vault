import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Backend-owned catalog routes need runtime rendering.
  // Keep local development on the root path and enable the prefix only in CI.
  trailingSlash: true,
  basePath: process.env.GITHUB_ACTIONS === "true" ? "/Vault" : "",
  assetPrefix: process.env.GITHUB_ACTIONS === "true" ? "/Vault/" : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.GITHUB_ACTIONS === "true" ? "/Vault" : "",
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
