// ==============================================
// GET /
//
// The site is a client-rendered SPA, so a plain fetch
// of a share link returns an empty <div id="root"> —
// nothing an agent could read unless it executes
// JavaScript, which most link-following agents don't.
//
// This serves the same index.html with the sound set
// injected, so one URL works for people and for
// agents. The React app still boots and takes over;
// the injected block sits outside #root so hydration
// never touches it, and main.tsx removes it on mount.
//
// The bare homepage comes through here too, carrying
// the default set — it's the URL an agent lands on
// when it was told the tool's name but given no link.
// Only *parameterized* URLs get their <head>
// rewritten; the homepage keeps the metadata that
// makes it the site's one indexable page.
//
// Ported from Ramps' api/render.ts, which learned
// most of the constraints below in production. Read
// the comments before simplifying any of them.
// ==============================================
import { buildAgentPayload, publicOrigin } from "../src/lib/agent.js"

/**
 * JSON that is safe to sit inside a `<script>` element.
 *
 * `JSON.stringify` does not escape `<`, so any string reaching the payload
 * could carry `</script>` and end the element early — everything after it is
 * then parsed as live HTML. That is not hypothetical: a crafted parameter did
 * exactly this on Ramps in production, and `s-maxage` pinned the result at the
 * edge.
 *
 * `<` is valid JSON and parses back to `<` identically, so no consumer
 * can tell the difference. Escaping here rather than at each field closes the
 * category for every field added later.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const SAFE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "frame-ancestors 'self'",
} as const

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const origin = publicOrigin(request)

  // The built shell, fetched as a static asset. "/index.html" isn't matched by
  // the rewrite that sent us here, so this cannot recurse.
  //
  // Never a cached copy. "/index.html" is a stable URL whose contents change
  // every deployment, so a CDN hit can hand this function the PREVIOUS build's
  // shell: stale meta tags, and asset hashes that now 404. Motion hit exactly
  // that in production — a current payload grafted onto a document whose
  // JavaScript no longer existed, which looks fine to an agent and is
  // completely broken for a person.
  //
  // Two defences because one is only a hint: cache "no-store" asks, and the
  // per-deployment query key guarantees a distinct cache entry even if the ask
  // is ignored. A query string doesn't change which static file resolves.
  const shellUrl = new URL("/index.html", url.origin)
  const build = process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA
  if (build) shellUrl.searchParams.set("__build", build)

  // Bounded, with one retry. Without a timeout a hung fetch holds a compute
  // concurrency slot until the platform default — unbilled I/O wait, but slots
  // are the contended resource under load.
  const fetchShell = () =>
    fetch(shellUrl, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
      headers: { "user-agent": "beeps-render" },
    })

  let shell: Response
  try {
    shell = await fetchShell()
  } catch {
    try {
      shell = await fetchShell()
    } catch {
      return new Response("Unable to load the page shell.", { status: 502 })
    }
  }
  if (!shell.ok) return new Response("Unable to load the page shell.", { status: 502 })

  let html = await shell.text()

  // Make sure what came back is actually our shell before injecting into it.
  //
  // `shell.ok` is not enough. With Deployment Protection on — the default for
  // preview deployments — this internal fetch is intercepted and served
  // Vercel's SSO login page with a 200, so the guard above passes and the
  // payload gets grafted onto somebody else's document. Ramps observed a
  // 508 KB login page with a working palette bolted to the bottom of it.
  //
  // Production is unprotected, so this never fires there. It is here because
  // silently wrapping the wrong page is a worse failure than not wrapping one.
  if (!html.includes('<div id="root">')) {
    return new Response(html, {
      status: shell.status,
      headers: {
        ...SAFE_HEADERS,
        "content-type": shell.headers.get("content-type") ?? "text/html",
      },
    })
  }

  let payload: ReturnType<typeof buildAgentPayload>
  try {
    payload = buildAgentPayload(url.search, origin)
  } catch {
    // A set we can't resolve shouldn't take the page down — fall back to the
    // untouched shell and let the client render it.
    return new Response(html, {
      status: 200,
      headers: { ...SAFE_HEADERS, "content-type": "text/html; charset=utf-8" },
    })
  }

  const { json, text, specific } = payload

  // Only a URL that asked for a particular set gets its <head> rewritten. The
  // bare homepage must keep `index, follow` and its own canonical — routing it
  // through here to pick up the readable block must not quietly deindex the
  // site's only indexable page.
  if (specific) {
    const canonical = `${origin}/${url.search}`
    // Each parameterized set is self-canonical so it shares and unfurls
    // correctly, but the query space is unbounded and letting a crawler wander
    // it would bloat the index of a site with exactly one real page. `follow`
    // keeps outbound links live, and this says nothing to agents — they fetch
    // and read regardless of indexing directives.
    //
    // Replacer FUNCTIONS throughout, never replacement strings: String.replace
    // expands `$&`, `` $` ``, `$'` and `$1` inside a replacement string, after
    // escaping has run — so a `$` in a value could splice a chunk of the
    // surrounding document into an attribute and break out of it.
    html = html
      .replace(
        /<link rel="canonical" href="[^"]*" \/>/,
        () => `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      )
      .replace(
        /(<meta property="og:url" content=")[^"]*(")/,
        (_m, open: string, close: string) => `${open}${escapeHtml(canonical)}${close}`,
      )
      .replace(
        /<meta name="robots" content="[^"]*" \/>/,
        '<meta name="robots" content="noindex, follow" />',
      )
  }

  // Both shapes on purpose: HTML-to-markdown conversion — what most agents do
  // before reading a page — strips <script>, so JSON alone would be invisible
  // to the very tools this exists for. The <pre> survives that conversion.
  //
  // Deliberately carries no hiding styles. `display:none` would be the obvious
  // way to keep it away from human eyes, but readability-style extractors
  // honour inline hiding and would skip the block, defeating the point. It
  // ships visible and src/main.tsx removes it once React mounts, so only
  // JS-less readers ever see it. It sits below the app, outside #root, so
  // hydration never touches it.
  const injected = `
<div id="agent-sounds">
<script type="application/json" id="beeps-sound-set">
${jsonForScript(json)}
</script>
<pre>
${escapeHtml(text)}
</pre>
</div>`

  html = html.replace("</body>", () => `${injected}\n</body>`)

  return new Response(html, {
    status: 200,
    headers: {
      ...SAFE_HEADERS,
      "content-type": "text/html; charset=utf-8",
      // Deterministic for a given query string, but NOT across deployments —
      // this HTML embeds the built shell, so it names hashed asset filenames
      // that only exist for as long as that build does. That makes it a
      // function of (query string, deployment), and a cache key that captures
      // only the first half must not outlive the second by much.
      //
      // It used to say s-maxage=31536000. A year is correct for api/sounds,
      // whose JSON really is a pure function of the URL — and wrong here, which
      // was demonstrated rather than theorised: a request that landed during a
      // deploy stored the previous build's HTML, and the edge then served that
      // stale app for as long as anyone kept asking. Not a 404, because Vercel
      // keeps old hashed assets resolvable; just the last version of the tool,
      // indefinitely, with nothing anywhere reporting a problem.
      //
      // 60s still absorbs a burst — a link shared to a crowd hits the function
      // once — while capping the blast radius of a badly-timed request at a
      // minute instead of a year. `must-revalidate` was already here and was
      // inert: it only governs what a cache does once an entry is STALE, and
      // nothing went stale for a year.
      "cache-control": "public, max-age=0, s-maxage=60, must-revalidate",
    },
  })
}
