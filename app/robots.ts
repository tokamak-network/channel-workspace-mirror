import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/.well-known/tokamak-private-state/channel-workspace/",
      ],
      disallow: [
        "/api/",
        "/observer/*/events",
      ],
    },
  };
}
