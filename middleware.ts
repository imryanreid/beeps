// ==============================================
// ROUTING MIDDLEWARE
// Sends "/" to the renderer that embeds the sound
// set in the HTML.
//
// This cannot be a `rewrites` rule in vercel.json:
// rewrites are evaluated *after* the filesystem
// check, and "/" is satisfied by the static
// index.html, so such a rule never fires. Middleware
// runs before that check.
//
// Every "/" request is diverted, including the bare
// homepage. That URL is how an agent told to "use
// beeps.studio" arrives — there is no link to follow
// yet, so it has to find the default set and the
// query-string contract in the page itself. Served
// as a static asset it found neither, and had to
// already know /api/sounds existed.
//
// Only "/" is matched, so /index.html stays a plain
// file and api/render can fetch it as the shell
// without recursing.
// ==============================================
import { rewrite } from "@vercel/functions"

export const config = { matcher: "/" }

export default function middleware(request: Request): Response {
  const url = new URL(request.url)
  const target = new URL("/api/render", url)
  target.search = url.search
  return rewrite(target)
}
