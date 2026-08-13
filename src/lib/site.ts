// ==============================================
// SITE CONSTANTS
// The canonical public address of the app. Share
// links and any absolute URL are built from this
// rather than from window.location, so a link
// copied from a Vercel preview deploy still points
// at the real site.
// ==============================================

/**
 * Canonical origin, no trailing slash.
 *
 * `www`, matching ramps.studio and springs.studio — the family picked one and
 * the only thing that matters is that every tool picks the same one, since a
 * site reachable at both spellings splits its own crawl.
 *
 * Override per-environment with `VITE_SITE_URL` (set it in the Vercel project
 * settings if you ever want preview deploys to generate self-referencing
 * links). Falls back to production so a plain `pnpm build` is always correct.
 */
export const SITE_URL: string = (
  import.meta.env.VITE_SITE_URL ?? "https://www.beeps.studio"
).replace(/\/+$/, "")
