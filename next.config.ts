import type { NextConfig } from "next";

const config: NextConfig = {
  // Uploaded TikTok exports can be large; the ingest route accepts the whole
  // file body in one request.
  experimental: { serverActions: { bodySizeLimit: "50mb" } },
};

export default config;
