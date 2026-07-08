import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo-seed server action reads fixture CSVs from disk; make sure they
  // ship with the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/dashboard": ["./fixtures/**/*"],
    "/": ["./fixtures/**/*"],
    "/api/selftest": ["./fixtures/**/*"],
  },
};

export default nextConfig;
