import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIRROR_REDIRECT_CACHE_SECONDS,
  MIRROR_REDIRECT_STALE_SECONDS,
  mirrorRedirectCacheHeaders,
  publicCacheHeader,
} from "../lib/cache-policy";

test("formats public CDN cache headers", () => {
  assert.equal(publicCacheHeader(60), "public, s-maxage=60, stale-while-revalidate=60");
  assert.equal(publicCacheHeader(60, 3600), "public, s-maxage=60, stale-while-revalidate=3600");
});

test("formats mirror redirect cache policy", () => {
  assert.deepEqual(mirrorRedirectCacheHeaders(), {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Vercel-CDN-Cache-Control": `max-age=${MIRROR_REDIRECT_CACHE_SECONDS}, stale-while-revalidate=${MIRROR_REDIRECT_STALE_SECONDS}`,
  });
});
