import type { NextConfig } from "next";

/**
 * One template, many teachers. Each build targets a single tenant:
 *   TENANT=<folder in /tenants>  BASE_PATH=/<sub-path or empty>  SITE_URL=https://...
 * scripts/build-all.mjs sets these for every enabled tenant.
 */
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
};

export default config;
