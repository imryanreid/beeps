// ==============================================
// THE AGENT PAYLOAD
// One serialization of a resolved set for machines,
// in both shapes: JSON and plain text.
//
// Both /api/sounds and /api/render read this. That is
// the point — CLAUDE.md's rule is that there is never
// a second serialization, and an endpoint that drifts
// from the page is exactly the way this tool would
// end up lying to somebody.
//
// It deliberately does NOT reuse src/lib/export.ts,
// which is the browser's copy. That module reaches
// the runtime through `?raw`, a Vite import a Node
// function cannot resolve, and its payload carries
// `normalizedGain` — a number that only exists after
// a real render. See `NOTES` below.
// ==============================================
import { DURATION_BUDGET, frequencySpan, resolve, soundingMs } from "./resolve.js"
import { decodeWarnings, resolveConfig } from "./params.js"
import { PRESETS, PRESET_IDS, type PresetId } from "./presets.js"
import { SOUND_SPECS } from "./sounds.js"

/** The origin this request arrived on, honouring the proxy headers. */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get("x-forwarded-host") ?? url.host
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  return `${proto}://${host}`
}

const round = (n: number, places = 0): number => {
  const f = Math.pow(10, places)
  return Math.round(n * f) / f
}

/**
 * Stated rather than implied.
 *
 * Every other number in the payload is exact, and a consumer has no way to
 * tell which ones are not unless it is told. Omitting the field and explaining
 * the omission is honest; emitting the unnormalized 1 would not be.
 */
const NOTES = {
  normalizedGain:
    "Omitted. Loudness normalization is measured from a real render, which needs Web Audio; a server has none. The browser applies it, so a sound played from the page is level-matched and these parameters alone are not.",
  durations: "durationMs is the envelope; soundingMs adds note offsets and any room tail.",
} as const

export type AgentPayload = {
  json: Record<string, unknown>
  text: string
  /** True when the URL asked for a particular set rather than the default. */
  specific: boolean
}

export function buildAgentPayload(search: string, origin: string): AgentPayload {
  const config = resolveConfig(search)
  const set = resolve(config)
  const warnings = decodeWarnings(search)
  const preset = PRESETS[set.presetId as PresetId] ?? PRESETS.soft

  const sounds = set.sounds.map((s) => {
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
  })

  const json = {
    $schema: "https://www.beeps.studio/schema/v1",
    generator: "Beeps — www.beeps.studio",
    source: `${origin}/${search}`,
    ...(warnings.length ? { warnings } : {}),
    preset: set.presetId,
    presetName: preset.name,
    baseHz: round(set.baseHz, 1),
    notes: NOTES,
    sounds,
    tiers: DURATION_BUDGET,
    presets: PRESET_IDS.map((id) => ({
      id,
      name: PRESETS[id].name,
      blurb: PRESETS[id].blurb,
      suits: PRESETS[id].suits,
    })),
    docs: `${origin}/llms.txt`,
  }

  const lines: string[] = []
  lines.push("BEEPS — www.beeps.studio", "")
  lines.push(`preset  ${set.presetId} (${preset.name})`)
  lines.push(`base    ${round(set.baseHz, 1)} Hz`, "")
  if (warnings.length) {
    lines.push("THIS LINK DID NOT ARRIVE INTACT", ...warnings.map((w) => `  ${w}`), "")
  }
  lines.push("SOUNDS")
  for (const s of sounds) {
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
  for (const id of PRESET_IDS) lines.push(`  ${id.padEnd(10)} ${PRESETS[id].blurb}`)
  lines.push("", "REGENERATE WITH DIFFERENT INPUTS")
  lines.push(`  ${origin}/?p=<preset>            one of: ${PRESET_IDS.join(", ")}`)
  lines.push(`  ${origin}/?b=<220-2000>          base frequency in Hz`)
  lines.push(`  ${origin}/?tap=f720.d100         per-sound overrides; see llms.txt`)
  lines.push(`  ${origin}/api/sounds             this data as JSON`)
  lines.push(`  ${origin}/api/sounds?format=text this data as text`)
  lines.push("", `Full contract: ${origin}/llms.txt`)
  lines.push(`Gain: ${NOTES.normalizedGain}`)

  return { json, text: lines.join("\n"), specific: search.replace(/^\?/, "").length > 0 }
}
