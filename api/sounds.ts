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
// It does NOT import src/lib/export.ts, though that
// is where the browser's JSON export lives. Two
// reasons, both real: that module pulls the runtime
// in through `?raw`, which is a Vite import a Node
// function cannot resolve; and its payload carries
// `normalizedGain`, which only exists after a real
// render. See the note this emits about that.
// ==============================================
import { resolve, soundingMs, frequencySpan, DURATION_BUDGET } from "../src/lib/resolve.js"
import { resolveConfig, decodeWarnings } from "../src/lib/params.js"
import { SOUND_SPECS } from "../src/lib/sounds.js"
import { PRESETS, PRESET_IDS } from "../src/lib/presets.js"

const round = (n: number, places = 0): number => {
  const f = Math.pow(10, places)
  return Math.round(n * f) / f
}

function payload(search: string, origin: string) {
  const config = resolveConfig(search)
  const set = resolve(config)
  const warnings = decodeWarnings(search)
  const preset = PRESETS[set.presetId as keyof typeof PRESETS] ?? PRESETS.soft

  return {
    $schema: "https://www.beeps.studio/schema/v1",
    generator: "Beeps — www.beeps.studio",
    source: `${origin}/${search}`,
    ...(warnings.length ? { warnings } : {}),

    preset: set.presetId,
    presetName: preset.name,
    baseHz: round(set.baseHz, 1),

    // Stated rather than implied. Every other number here is exact, and a
    // consumer has no way to tell which ones are not without being told.
    notes: {
      normalizedGain:
        "Omitted. Loudness normalization is measured from a real render, which needs Web Audio; this endpoint has none. The browser applies it, so a sound played from the page is level-matched and these parameters alone are not.",
      durations: "durationMs is the envelope; soundingMs adds note offsets and any room tail.",
    },

    sounds: set.sounds.map((s) => {
      const spec = SOUND_SPECS.find((x) => x.id === s.id)!
      const span = frequencySpan(s)
      return {
        id: s.id,
        tier: s.tier,
        durationMs: round(s.durationMs, 1),
        soundingMs: round(soundingMs(s), 1),
        frequencyHz: { min: round(span.minHz), max: round(span.maxHz) },
        voices: s.voices.length,
        when: spec.when,
        whenNot: spec.whenNot,
      }
    }),

    tiers: DURATION_BUDGET,
    presets: PRESET_IDS.map((id) => ({
      id,
      name: PRESETS[id].name,
      blurb: PRESETS[id].blurb,
      suits: PRESETS[id].suits,
    })),
    docs: `${origin}/llms.txt`,
  }
}

function asText(data: ReturnType<typeof payload>): string {
  const lines: string[] = []
  lines.push(`${data.generator}`, "")
  lines.push(`preset  ${data.preset} (${data.presetName})`)
  lines.push(`base    ${data.baseHz} Hz`, "")
  if (data.warnings?.length) {
    lines.push("THIS LINK DID NOT ARRIVE INTACT", ...data.warnings.map((w) => `  ${w}`), "")
  }
  lines.push("SOUNDS")
  for (const s of data.sounds) {
    lines.push(
      `  ${s.id}`,
      `    tier      ${s.tier}`,
      `    length    ${s.soundingMs} ms`,
      `    range     ${s.frequencyHz.min}-${s.frequencyHz.max} Hz`,
      `    play when ${s.when}`,
      `    not when  ${s.whenNot}`,
    )
  }
  lines.push("", "PRESETS")
  for (const p of data.presets) lines.push(`  ${p.id.padEnd(10)} ${p.blurb}`)
  lines.push("", `Full parameter contract: ${data.docs}`)
  lines.push(`Gain: ${data.notes.normalizedGain}`)
  return lines.join("\n")
}

export function GET(request: Request): Response {
  const url = new URL(request.url)
  const origin = `https://${request.headers.get("host") ?? "www.beeps.studio"}`

  // The site's own guarantee is that a link always resolves to a playable set —
  // every field is clamped rather than rejected. This holds that line for the
  // one case the clamps cannot: input hostile enough to throw. Falling back to
  // the default set is more useful to an agent than a 500, and it cannot leak
  // anything, because there is no state here to leak.
  let data: ReturnType<typeof payload>
  try {
    data = payload(url.search, origin)
  } catch {
    data = payload("", origin)
  }

  // Text when asked for it, either by query or by Accept. An agent that sends
  // no Accept header at all gets JSON, which is the more useful default.
  const accept = request.headers.get("accept") ?? ""
  const wantsText =
    url.searchParams.get("format") === "text" ||
    (accept.includes("text/plain") && !accept.includes("application/json"))

  const body = wantsText ? asText(data) : JSON.stringify(data, null, 2)

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": wantsText
        ? "text/plain; charset=utf-8"
        : "application/json; charset=utf-8",
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
