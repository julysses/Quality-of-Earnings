import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo-seed server action reads fixture CSVs from disk; make sure they
  // ship with the serverless bundle on Vercel.
  outputFileTracingIncludes: {
    "/dashboard": ["./fixtures/**/*"],
    "/": ["./fixtures/**/*"],
    "/api/selftest": ["./fixtures/**/*"],
  },
  // pdfjs-dist does its own Node/browser environment detection and dynamic
  // requires (fs, path) that confuse bundlers — run it unbundled from
  // node_modules on the server instead.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
