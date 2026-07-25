import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the dev-mode overlay indicator in the corner ("N" / build activity).
  // This is a visual concern only — hot-reload still works.
  devIndicators: false,

  // Allow any device on the local network to connect to the dev server.
  // Without this, Next.js blocks cross-origin requests from phones/tablets
  // accessing the dev server via LAN IP, which prevents React hydration
  // and makes all buttons unresponsive.
  // Entries must be bare hostnames/IPs (no http:// prefix, no port).
  // IPv4 wildcards need all 4 segments, e.g. "192.168.1.*" not "192.168.*".
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
  ],
};

export default nextConfig;
