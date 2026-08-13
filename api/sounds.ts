// ==============================================
// GET /api/sounds
// The resolved set as JSON or plain text, for
// agents and scripts that want data rather than a
// page.
//
// Same query contract as the site itself, so an
// agent handed a share link can swap "/" for
// "/api/sounds" and get the machine-readable form.
// Pure function of the query string — no state, no
// storage — so responses cache indefinitely.
//
// The payload itself lives in src/lib/agent.ts and
// is shared with /api/render. One serialization, per
// CLAUDE.md — an endpoint that drifts from the page
// is how this tool would end up lying to somebody.
// ==============================================
import { buildAgentPayload, publicOrigin } from "../src/lib/agent.js"

export function GET(request: Request): Response {
  const url = new URL(request.url)
  const origin = publicOrigin(request)

  // `format` belongs to this endpoint, not to the sound contract, so it has to
  // come off before decoding — left in, decodeWarnings reads it as a parameter
  // naming a sound that does not exist and the response opens by announcing
  // that the link did not arrive intact.
  const params = new URLSearchParams(url.search)
  const format = params.get("format")
  params.delete("format")
  const search = params.toString() ? `?${params}` : ""

  // The site's own guarantee is that a link always resolves to a playable set —
  // every field is clamped rather than rejected. This holds that line for the
  // one case the clamps cannot: input hostile enough to throw. Falling back to
  // the default set is more useful to an agent than a 500, and it cannot leak
  // anything, because there is no state here to leak.
  let payload: ReturnType<typeof buildAgentPayload>
  try {
    payload = buildAgentPayload(search, origin)
  } catch {
    payload = buildAgentPayload("", origin)
  }

  // Text when asked for it, either by query or by Accept. An agent that sends
  // no Accept header at all gets JSON, which is the more useful default.
  const accept = request.headers.get("accept") ?? ""
  const wantsText =
    format === "text" || (accept.includes("text/plain") && !accept.includes("application/json"))

  const body = wantsText ? payload.text : JSON.stringify(payload.json, null, 2)

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": wantsText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
      // Echoes URL-derived content, so never let a browser sniff it as HTML.
      "x-content-type-options": "nosniff",
      // Deterministic output, so let the CDN keep it indefinitely.
      "cache-control": "public, max-age=0, s-maxage=31536000, immutable",
      // Read-only public data; usable from anywhere.
      "access-control-allow-origin": "*",
      // The HTML page is the indexable surface, not this.
      "x-robots-tag": "noindex",
    },
  })
}
