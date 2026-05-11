import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/.well-known/tokamak-private-state/channel-workspace/:chainId/:channelId/manifest.json",
        destination: "/api/mirror/channel-workspace/:chainId/:channelId/manifest",
      },
      {
        source: "/.well-known/tokamak-private-state/channel-workspace/:chainId/:channelId/checkpoint.zip",
        destination: "/api/mirror/channel-workspace/:chainId/:channelId/checkpoint",
      },
      {
        source: "/.well-known/tokamak-private-state/channel-workspace/:chainId/:channelId/deltas/:range",
        destination: "/api/mirror/channel-workspace/:chainId/:channelId/deltas/:range",
      },
    ];
  },
};

export default nextConfig;
