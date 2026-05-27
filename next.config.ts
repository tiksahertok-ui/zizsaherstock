import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-28ecfb2f-849c-45a0-b87b-72a23441e259.space-z.ai",
  ],
};

export default nextConfig;
