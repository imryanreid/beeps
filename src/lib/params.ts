// ==============================================
// URL PARAMS
// The query-string contract: encode the state that
// reproduces a sound set, and decode it defensively.
//
// Once this ships these names are a public API — a
// shared link has to keep working — so changing one
// means changing README.md, public/llms.txt and the
// JSON-LD in index.html at the same time.
//
// Deltas only. A field that matches what the preset
// derives is not written, which is what keeps a whole
// set inside a couple of hundred characters.
//
// No base64. It encodes 3 bytes as 4, so it would
// make these URLs a third LONGER, and it only ever
// shortens things when paired with a compressor worth
// running — which nothing is at this size. It would
// also make the link unreadable to the agents this
// tool exists for: they can compute base64 fine, but
// they cannot diff it, explain it, or hand-write one
// from the parameter table in the markdown export.
//
// "." separates fields and "-" and "_" are safe;
// those are the punctuation URLSearchParams leaves
// alone. "~" looks safe and is not — it comes back
// as %7E.
//
// Deliberately free of browser and Vite globals so a
// Vercel Function can import it.
// ==============================================
import { SOUND_IDS, type SoundId } from "./sounds.js"
import { DEFAULT_PRESET, PRESETS, isPresetId, type PresetId } from "./presets.js"
import { DEFAULT_CONFIG, LIMITS, resolve, type SetConfig, type SoundDelta } from "./resolve.js"

/**
 * Field codes. Two letters or one, then a number.
 *
 * Short because they repeat once per edited sound, and readable because the
 * markdown export documents them and an agent is expected to construct one.
 */
const FIELDS = {
  f: "startHz",
  e: "endHz",
  a: "attackMs",
  d: "decayMs",
  r: "releaseMs",
  w: "sweepMs",
  g: "gainTrimDb",
  c: "cutoffHz",
  q: "q",
} as const satisfies Record<string, keyof SoundDelta>

type FieldCode = keyof typeof FIELDS

/** Q travels ×10 so a resonance of 0.7 is written `q7` rather than `q0.7`. */
const SCALE: Partial<Record<FieldCode, number>> = { q: 10 }

/** How much precision each field keeps. Sub-Hz frequencies help nobody. */
const ROUND: Partial<Record<FieldCode, number>> = { a: 1, g: 1 }

const round = (v: number, dp = 0) => {
  const m = Math.pow(10, dp)
  return Math.round(v * m) / m
}

/**
 * The sound-id ↔ URL-key mapping.
 *
 * `toggle.on` carries a dot, which is also the field separator, so ids travel
 * with the dot swapped for a hyphen. Doing this in one place means the id can
 * stay readable in code and in the agent payload without the codec having to
 * care.
 */
export const idToKey = (id: SoundId): string => id.replace(".", "-")
export const keyToId = (key: string): SoundId | undefined =>
  SOUND_IDS.find((id) => idToKey(id) === key)

function encodeDelta(delta: SoundDelta): string {
  const parts: string[] = []
  for (const [code, field] of Object.entries(FIELDS) as [FieldCode, keyof SoundDelta][]) {
    const raw = delta[field]
    if (raw === undefined) continue
    const scaled = raw * (SCALE[code] ?? 1)
    parts.push(`${code}${round(scaled, ROUND[code] ?? 0)}`)
  }
  return parts.join(".")
}

function decodeDelta(raw: string): SoundDelta | undefined {
  const out: SoundDelta = {}
  let found = false
  for (const part of raw.split(".")) {
    if (!part) continue
    // Longest code first would matter if any code were a prefix of another.
    // They are all one character today; the match is written to survive a
    // two-character code being added later.
    const match = /^([a-z]+)(-?\d+(?:\.\d+)?)$/.exec(part)
    if (!match) continue
    const code = match[1] as FieldCode
    const field = FIELDS[code]
    if (!field) continue
    const value = Number(match[2]) / (SCALE[code] ?? 1)
    if (!Number.isFinite(value)) continue
    out[field] = value
    found = true
  }
  return found ? out : undefined
}

/**
 * Only what differs from the preset.
 *
 * Compared against a freshly resolved preset rather than against the preset
 * object, because a preset defines a shape and `resolve` turns it into
 * frequencies — the two are not comparable field by field.
 */
export function encodeConfig(config: SetConfig): string {
  const p = new URLSearchParams()
  if (config.presetId !== DEFAULT_PRESET) p.set("p", config.presetId)

  const preset = PRESETS[config.presetId] ?? PRESETS[DEFAULT_PRESET]
  if (config.baseHz !== undefined && Math.round(config.baseHz) !== Math.round(preset.baseHz)) {
    p.set("b", String(Math.round(config.baseHz)))
  }

  for (const id of SOUND_IDS) {
    const delta = config.deltas[id]
    if (!delta) continue
    const encoded = encodeDelta(delta)
    if (encoded) p.set(idToKey(id), encoded)
  }

  // URLSearchParams percent-encodes "." in values on some runtimes and not
  // others. It is safe unencoded in a query string per RFC 3986, and leaving
  // it readable is the point, so put it back.
  return p.toString().replace(/%2E/gi, ".").replace(/%2C/gi, ",")
}

/** Parse a query string into a partial config, dropping any invalid field. */
export function decodeConfig(search: string): Partial<SetConfig> {
  const p = new URLSearchParams(search)
  const out: Partial<SetConfig> = {}

  const preset = p.get("p")
  if (preset && isPresetId(preset)) out.presetId = preset

  const base = Number(p.get("b"))
  if (Number.isFinite(base) && base > 0) {
    out.baseHz = Math.min(LIMITS.baseHz[1], Math.max(LIMITS.baseHz[0], base))
  }

  const deltas: Partial<Record<SoundId, SoundDelta>> = {}
  for (const [key, value] of p.entries()) {
    if (key === "p" || key === "b") continue
    const id = keyToId(key)
    if (!id) continue
    const delta = decodeDelta(value)
    if (delta) deltas[id] = delta
  }
  if (Object.keys(deltas).length) out.deltas = deltas

  return out
}

/** A complete config, filling anything the query string didn't supply. */
export function resolveConfig(search: string): SetConfig {
  const decoded = decodeConfig(search)
  return {
    presetId: (decoded.presetId ?? DEFAULT_CONFIG.presetId) as PresetId,
    ...(decoded.baseHz !== undefined ? { baseHz: decoded.baseHz } : {}),
    deltas: decoded.deltas ?? {},
  }
}

/** True while the visitor is still looking at an untouched preset. */
export function isDefaultConfig(config: SetConfig): boolean {
  return encodeConfig(config) === encodeConfig(DEFAULT_CONFIG)
}

/**
 * What this link lost on the way here.
 *
 * A link naming a sound that does not exist, or a preset that does not, is
 * either stale or was mangled in transit. The decoder already knows — it drops
 * those keys — and used to say nothing, which meant an agent could review a
 * coherent set that is not the one that was shared.
 */
export function decodeWarnings(search: string): string[] {
  const p = new URLSearchParams(search)
  const out: string[] = []

  const preset = p.get("p")
  if (preset && !isPresetId(preset)) {
    out.push(
      `This link asks for a preset called "${preset.slice(0, 24)}", which does not exist. ` +
        `Showing ${DEFAULT_PRESET} instead, so what you are reading is not the set that was shared.`,
    )
  }

  const unknown: string[] = []
  for (const key of p.keys()) {
    if (key === "p" || key === "b") continue
    if (!keyToId(key)) unknown.push(key)
  }
  if (unknown.length) {
    // Quote back only what looks like a key, and only a few. Rejected input is
    // the least trustworthy thing in the system, and this is the one place
    // that repeats it.
    const named = unknown.filter((k) => /^[A-Za-z0-9_-]{1,20}$/.test(k)).slice(0, 4)
    const which = named.length ? ` (${named.join(", ")})` : ""
    out.push(
      `${unknown.length} parameter${unknown.length === 1 ? "" : "s"} in this link ` +
        `${unknown.length === 1 ? "names a sound that is not" : "name sounds that are not"} in the set${which}. ` +
        `Either the link is stale, or it was rewritten in transit.`,
    )
  }

  return out
}

/** The set a query string describes. The one entry point the app and any function share. */
export function setFromSearch(search: string) {
  return resolve(resolveConfig(search))
}
