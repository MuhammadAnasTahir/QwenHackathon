import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-mode overlay indicator in the corner ("N" / build activity).
  // This is a visual concern only — hot-reload still works.
  devIndicators: false,
};

export default nextConfig;
