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
import {
  DURATION_BUDGET,
  durationVerdict,
  frequencySpan,
  resolve,
  soundingMs,
} from "./resolve.js"
import { decodeWarnings, idToKey, resolveConfig } from "./params.js"
import { PRESETS, PRESET_IDS, type PresetId } from "./presets.js"
import { SOUND_SPECS, type Sound } from "./sounds.js"

/** Semitone names, for the character line. Index is the interval size. */
const INTERVALS = [
  "unison",
  "minor second",
  "major second",
  "minor third",
  "major third",
  "fourth",
  "tritone",
  "fifth",
  "minor sixth",
  "major sixth",
  "minor seventh",
  "major seventh",
  "octave",
]

/**
 * One sentence describing how a sound behaves, derived from its own numbers.
 *
 * A consumer can already read every parameter; what it cannot do cheaply is say
 * what they add up to. "Rises a major second over 437 ms, swelling with no
 * transient" is the difference between an agent measuring a set and being able
 * to describe it.
 */
function characterLine(s: Sound): string {
  const osc = s.voices.find((v) => v.kind === "osc")
  const parts: string[] = []

  if (osc && osc.kind === "osc") {
    const { startHz, endHz } = osc.pitch
    const semis = Math.abs(12 * Math.log2(endHz / startHz))
    const name = INTERVALS[Math.round(semis)] ?? `${semis.toFixed(1)} semitones`
    if (semis < 0.5) parts.push(`Holds one note for ${Math.round(soundingMs(s))} ms`)
    else
      parts.push(
        `${endHz > startHz ? "Rises" : "Falls"} a ${name} over ${Math.round(soundingMs(s))} ms`,
      )

    const a = osc.env.attackMs
    if (a <= 2) parts.push("opening on a click")
    else if (a <= 8) parts.push("with a fast onset")
    else if (a >= 25) parts.push("swelling in with no transient")
    else parts.push("with a soft onset")
  } else {
    parts.push(`A noise burst of ${Math.round(soundingMs(s))} ms`)
  }

  if (s.filter.cutoffHz <= 1200) parts.push("and a dark, filtered tail")
  else if (s.filter.q >= 8) parts.push("and a resonant peak")
  if (s.space) parts.push("in a small room")

  return `${parts.join(", ")}.`
}

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
    const osc = s.voices.find((v) => v.kind === "osc")
    const budget = DURATION_BUDGET[s.tier]
    const verdict = durationVerdict(s)

    // Which fields this link edited, and whether it was given its own voice.
    // Without these the only way to tell an edited set from a stock one was to
    // fetch the default and diff all eleven rows by hand.
    const delta = config.deltas[s.id]
    const overrides = delta ? Object.keys(delta).sort() : []
    const voice = config.presets?.[s.id]

    return {
      id: s.id,
      /** URL parameter name for this sound. Both spellings decode; this is the canonical one. */
      key: idToKey(s.id),
      tier: s.tier,
      durationMs: round(s.durationMs),
      soundingMs: round(soundingMs(s)),
      /** Lowest and highest frequency ANY voice touches — not the primary sweep. */
      frequencyHz: { min: round(span.minHz), max: round(span.maxHz) },
      /**
       * The primary voice's own sweep. This is the one that mirrors across an
       * inversion pair; `frequencyHz` spans every layer and does not.
       */
      ...(osc && osc.kind === "osc"
        ? {
            pitchHz: {
              start: round(osc.pitch.startHz),
              end: round(osc.pitch.endHz),
              sweepMs: round(osc.pitch.sweepMs),
            },
            envelopeMs: {
              attack: round(osc.env.attackMs, 1),
              decay: round(osc.env.decayMs, 1),
              sustain: osc.env.sustain,
              release: round(osc.env.releaseMs, 1),
            },
          }
        : {}),
      filter: {
        type: s.filter.type,
        cutoffHz: round(s.filter.cutoffHz),
        ...(s.filter.endCutoffHz ? { endCutoffHz: round(s.filter.endCutoffHz) } : {}),
        q: round(s.filter.q, 2),
      },
      voices: s.voices.length,
      budget: {
        minMs: budget.minMs,
        maxMs: budget.maxMs,
        verdict,
        ...(verdict !== "ok"
          ? {
              problem:
                verdict === "long"
                  ? `${round(soundingMs(s))} ms exceeds the ${budget.maxMs} ms ceiling for ${s.tier}.`
                  : `${round(soundingMs(s))} ms is under the ${budget.minMs} ms floor for ${s.tier}; it will be heard as quieter rather than subtler.`,
            }
          : {}),
      },
      ...(overrides.length ? { overrides } : {}),
      ...(voice ? { voice } : {}),
      character: characterLine(s),
      when: spec.when,
      whenNot: spec.whenNot,
    }
  })

  // Budget violations are a property of the SET, so they belong beside the
  // link warnings rather than only per-sound. The page flags these in amber;
  // until now the agent surface shipped them silently.
  const overBudget = sounds.filter((s) => s.budget.verdict !== "ok")

  const json = {
    $schema: "https://www.beeps.studio/schema/v1",
    generator: "Beeps — www.beeps.studio",
    source: `${origin}/${search}`,
    ...(warnings.length ? { warnings } : {}),
    ...(overBudget.length
      ? { budgetViolations: overBudget.map((s) => `${s.id}: ${s.budget.problem}`) }
      : {}),
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
  if (overBudget.length) {
    lines.push(
      "OUT OF BUDGET",
      ...overBudget.map((s) => `  ${s.id}: ${s.budget.problem}`),
      "",
    )
  }
  lines.push("TIER BUDGETS")
  for (const [tier, b] of Object.entries(DURATION_BUDGET)) {
    lines.push(`  ${tier.padEnd(9)} ${b.minMs}-${b.maxMs} ms`)
  }
  lines.push("")
  lines.push("SOUNDS")
  for (const s of sounds) {
    lines.push(`  ${s.id}${s.voice ? `  [voice: ${s.voice}]` : ""}`)
    if (s.overrides) lines.push(`    override  ${s.overrides.join(", ")}`)
    lines.push(
      `    tier      ${s.tier}${s.budget.verdict === "ok" ? "" : `  ** ${s.budget.verdict.toUpperCase()} **`}`,
      `    length    ${s.soundingMs} ms  (${s.tier} budget ${s.budget.minMs}-${s.budget.maxMs})`,
    )
    if (s.pitchHz) {
      lines.push(`    pitch     ${s.pitchHz.start} -> ${s.pitchHz.end} Hz over ${s.pitchHz.sweepMs} ms`)
    }
    if (s.envelopeMs) {
      const e = s.envelopeMs
      lines.push(`    envelope  a ${e.attack} / d ${e.decay} / s ${e.sustain} / r ${e.release} ms`)
    }
    lines.push(
      `    filter    ${s.filter.type} ${s.filter.cutoffHz} Hz, Q ${s.filter.q}`,
      `    span      ${s.frequencyHz.min}-${s.frequencyHz.max} Hz across ${s.voices} voice${s.voices === 1 ? "" : "s"}`,
      `    character ${s.character}`,
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
