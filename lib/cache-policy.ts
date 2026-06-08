export const MIRROR_REDIRECT_CACHE_SECONDS = 3600;
export const MIRROR_REDIRECT_STALE_SECONDS = 86400;

export function publicCacheHeader(ttlSeconds: number, staleWhileRevalidateSeconds = ttlSeconds) {
  return `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;
}

export function mirrorRedirectCacheHeader() {
  return publicCacheHeader(MIRROR_REDIRECT_CACHE_SECONDS, MIRROR_REDIRECT_STALE_SECONDS);
}
