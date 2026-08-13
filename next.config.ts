import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "space-z.ai",
    "preview-chat-f3075201-d84e-43b4-8f94-b73ab1b908dc.space-z.ai",
  ],
};

export default nextConfig;
