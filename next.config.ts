import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  allowedDevOrigins: ["204.168.213.112", "204.168.213.112.nip.io", "*.nip.io"],
  // Verberg de zwarte Next.js dev-indicator ("N"-rondje) die over de UI heen valt.
  devIndicators: false,
};

export default nextConfig;
