import type { NextConfig } from "next";

/**
 * One deployment serves every teacher. proxy.ts maps each request's domain to
 * /sites/<site>/..., pages read the teacher's data from Supabase, and saving in
 * /admin invalidates that teacher's cached pages. No rebuilds on content changes.
 */
const config: NextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  partialPrefetching: true,
  images: { unoptimized: true },
  // The platform console's "Import" reads tenants/* at runtime.
  outputFileTracingIncludes: { "/sites/[site]/admin": ["./tenants/**/*"] },
  experimental: {
    // Image uploads go through a server action; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default config;
