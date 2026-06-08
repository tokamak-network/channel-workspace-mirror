export const MIRROR_REDIRECT_CACHE_SECONDS = 3600;
export const MIRROR_REDIRECT_STALE_SECONDS = 86400;

export function publicCacheHeader(ttlSeconds: number, staleWhileRevalidateSeconds = ttlSeconds) {
  return `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;
}

export function mirrorRedirectCacheHeaders() {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Vercel-CDN-Cache-Control": `max-age=${MIRROR_REDIRECT_CACHE_SECONDS}, stale-while-revalidate=${MIRROR_REDIRECT_STALE_SECONDS}`,
  };
}
