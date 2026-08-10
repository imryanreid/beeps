// ==============================================
// RESOLVE
// Preset + deltas → one complete SoundSet, with
// every frequency computed and nothing left to
// derive.
//
// This is the single source every consumer reads.
// Live playback, the offline WAV render, the JS
// export, the JSON and the agent markdown all take
// *this object* and none of them recompute anything.
// That is what guarantees the file you download is
// the sound you heard — a second code path for
// offline rendering is the most likely way this tool
// ends up lying to people.
//
// Pure and framework-free, so it runs in the browser,
// in a Vercel Function and in a Node test alike. It
// touches no AudioContext: normalization needs a
// rendered buffer, so it arrives separately via
// applyNormalization().
// ==============================================
import {
  PAIRS,
  SOUND_SPECS,
  isDerivedPitch,
  partnerOf,
  pitchCanonical,
  type Envelope,
  type Sound,
  type SoundId,
  type SoundSet,
  type Voice,
  type VoiceSpec,
} from "./sounds.js"
import { DEFAULT_PRESET, PRESETS, type PresetDef, type PresetId } from "./presets.js"

/**
 * A per-sound override. Every field optional — an absent field means "whatever
 * the preset derives", which is what keeps the URL short.
 *
 * `startHz` / `endHz` address the primary voice. Any further voices transpose
 * by the same ratio, so retuning a two-note sound moves both notes and keeps
 * the interval between them.
 */
export type SoundDelta = {
  startHz?: number
  endHz?: number
  attackMs?: number
  decayMs?: number
  releaseMs?: number
  durationMs?: number
  /** Trim in dB against the tier's level. Negative is quieter. */
  gainTrimDb?: number
  cutoffHz?: number
  q?: number
}

export type SetConfig = {
  presetId: PresetId
  /** Overrides the preset's own base. Absent means "use the preset's". */
  baseHz?: number
  deltas: Partial<Record<SoundId, SoundDelta>>
}

export const DEFAULT_CONFIG: SetConfig = { presetId: DEFAULT_PRESET, deltas: {} }

// Bounds. Anything reachable by a hand-edited URL has to survive being wrong.
export const LIMITS = {
  baseHz: [220, 2000],
  freqHz: [20, 20000],
  attackMs: [0.5, 200],
  decayMs: [1, 1000],
  releaseMs: [1, 1000],
  durationMs: [10, 2000],
  gainTrimDb: [-40, 12],
  cutoffHz: [80, 20000],
  q: [0.0001, 20],
} as const

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Equal temperament. The whole set is intervals from one base. */
export const semitonesToHz = (baseHz: number, semitones: number): number =>
  baseHz * Math.pow(2, semitones / 12)

const dbToLinear = (db: number) => Math.pow(10, db / 20)

/**
 * The envelope for one voice, shortened to fit if it overruns.
 *
 * Attack, decay and release are times; the sustain segment is whatever the
 * duration has left. When the three named segments already exceed the duration
 * they scale down together rather than the sound running long — a duration
 * budget that a preset could silently blow past would make the 200 ms warning
 * meaningless.
 */
export function fitEnvelope(env: Envelope, durationMs: number): Envelope {
  const fixed = env.attackMs + env.decayMs + env.releaseMs
  if (fixed <= durationMs) return env
  const scale = durationMs / fixed
  return {
    attackMs: Math.max(LIMITS.attackMs[0], env.attackMs * scale),
    decayMs: Math.max(0.5, env.decayMs * scale),
    sustain: env.sustain,
    releaseMs: Math.max(0.5, env.releaseMs * scale),
  }
}

/**
 * Where a voice's sweep starts, in semitones.
 *
 * A spec declares the *semantic* interval — the fall in `tap`, the rise in
 * `toggle.on`. The preset scales that depth but never reverses it, because
 * direction is meaning. A voice that declares no interval of its own gets the
 * preset's intrinsic downward glide instead, which is how the steady notes in
 * `success` and `notification` still sound like they belong to the preset.
 */
export function sweepStartSemitones(v: VoiceSpec, preset: PresetDef): number {
  if (v.from === v.to) return v.to + preset.intrinsicSweep
  return v.to + (v.from - v.to) * preset.sweepScale
}

function buildVoices(
  spec: (typeof SOUND_SPECS)[number],
  preset: PresetDef,
  baseHz: number,
  durationMs: number,
  delta: SoundDelta,
): Voice[] {
  const env = fitEnvelope(
    {
      attackMs: clamp(delta.attackMs ?? preset.attackMs, ...LIMITS.attackMs),
      decayMs: clamp(delta.decayMs ?? preset.decayMs, ...LIMITS.decayMs),
      sustain: preset.sustain,
      releaseMs: clamp(delta.releaseMs ?? preset.releaseMs, ...LIMITS.releaseMs),
    },
    durationMs,
  )

  const primary = spec.voices[0]
  const derivedStart = semitonesToHz(baseHz, sweepStartSemitones(primary, preset))
  const derivedEnd = semitonesToHz(baseHz, primary.to)

  // An explicit pitch override retunes the whole sound. Secondary voices move
  // by the same ratio, so a two-note sound keeps the interval between its
  // notes rather than collapsing onto the primary.
  const startHz = delta.startHz ?? derivedStart
  const endHz = delta.endHz ?? derivedEnd
  const ratio = (startHz + endHz) / (derivedStart + derivedEnd)

  const voices: Voice[] = spec.voices.map((v, i) => {
    const vStart =
      i === 0 ? startHz : semitonesToHz(baseHz, sweepStartSemitones(v, preset)) * ratio
    const vEnd = i === 0 ? endHz : semitonesToHz(baseHz, v.to) * ratio
    return {
      kind: "osc",
      waveform: preset.waveform,
      pitch: {
        startHz: clamp(vStart, ...LIMITS.freqHz),
        endHz: clamp(vEnd, ...LIMITS.freqHz),
        sweepMs: durationMs * preset.sweepShare,
      },
      env,
      gain: v.gain * preset.gain[spec.tier],
      startOffsetMs: v.offsetShare * durationMs,
    }
  })

  // The noise layer, when the preset carries one or the sound insists. `delete`
  // insists: an octave drop with no transient reads as a swoop, not a removal.
  const noise = preset.noise ?? (spec.forceNoise ? { amount: 0.2, decayMs: 8 } : null)
  if (noise) {
    voices.push({
      kind: "noise",
      env: fitEnvelope(
        { attackMs: 0.5, decayMs: noise.decayMs, sustain: 0, releaseMs: 4 },
        durationMs,
      ),
      gain: noise.amount * preset.gain[spec.tier],
      startOffsetMs: 0,
    })
  }

  return voices
}

/**
 * Rewrite `derived`'s pitches as `canonical`'s, swapped.
 *
 * The inversion is computed here rather than declared in two specs, because
 * declared mirrors stop mirroring the moment a preset scales their sweeps —
 * each spec scales toward its own destination, so `toggle.on` and
 * `toggle.off` drift apart by several Hz on every preset but a neutral one.
 * Deriving makes it exact by construction and means a hand-edited URL cannot
 * desynchronise a pair either.
 *
 * Only the pitches transfer. Duration, envelope, filter and gain stay the
 * derived sound's own, so a `close` may legitimately be quieter or shorter
 * than its `open`.
 */
function invertPitches(derived: Sound, canonical: Sound): Sound {
  const source = canonical.voices.filter((v) => v.kind === "osc")
  let i = 0
  return {
    ...derived,
    voices: derived.voices.map((v) => {
      if (v.kind !== "osc") return v
      const from = source[i++]
      if (!from || from.kind !== "osc") return v
      return {
        ...v,
        pitch: { ...v.pitch, startHz: from.pitch.endHz, endHz: from.pitch.startHz },
      }
    }),
  }
}

/** Preset + deltas → the finished set. `normalizedGain` is filled in later. */
export function resolve(config: SetConfig): SoundSet {
  const preset = PRESETS[config.presetId] ?? PRESETS[DEFAULT_PRESET]
  const baseHz = clamp(config.baseHz ?? preset.baseHz, ...LIMITS.baseHz)

  const built: Sound[] = SOUND_SPECS.map((spec) => {
    const delta = config.deltas[spec.id] ?? {}
    const durationMs = clamp(
      delta.durationMs ?? preset.duration[spec.tier],
      ...LIMITS.durationMs,
    )

    const trim = delta.gainTrimDb === undefined ? 1 : dbToLinear(delta.gainTrimDb)
    const voices = buildVoices(spec, preset, baseHz, durationMs, delta).map((v) => ({
      ...v,
      gain: v.gain * trim,
    }))

    return {
      id: spec.id,
      voices,
      filter: {
        type: preset.filterType,
        cutoffHz: clamp(
          delta.cutoffHz ?? preset.filterCutoffHz * (spec.cutoffScale ?? 1),
          ...LIMITS.cutoffHz,
        ),
        q: clamp(delta.q ?? preset.filterQ, ...LIMITS.q),
      },
      durationMs,
      tier: spec.tier,
      // Unnormalized until applyNormalization runs. Never authored.
      normalizedGain: 1,
    }
  })

  // Inversion partners take their pitches from the canonical member, now that
  // every sound exists. This is the one pass that has to run after the map.
  const byId = new Map<SoundId, Sound>(built.map((s) => [s.id, s]))
  for (const pair of PAIRS) {
    if (pair.kind !== "inversion") continue
    const canonical = byId.get(pair.a)
    const derived = byId.get(pair.b)
    if (canonical && derived) byId.set(pair.b, invertPitches(derived, canonical))
  }

  return { presetId: config.presetId, baseHz, sounds: built.map((s) => byId.get(s.id) ?? s) }
}

/** The set with measured gains folded in. See loudness.ts for where they come from. */
export function applyNormalization(
  set: SoundSet,
  gains: Partial<Record<SoundId, number>>,
): SoundSet {
  return {
    ...set,
    sounds: set.sounds.map((s) => ({ ...s, normalizedGain: gains[s.id] ?? s.normalizedGain })),
  }
}

/**
 * Total sounding time, which is what the 200 ms budget measures.
 *
 * Not `durationMs`: a voice can start late and its release runs past the
 * nominal end, so a 180 ms sound with a 40 ms tail is a 220 ms sound. Budgeting
 * the nominal figure would let every sound in the set quietly exceed the line
 * it is being checked against.
 */
export function soundingMs(sound: Sound): number {
  return Math.max(
    ...sound.voices.map((v) => v.startOffsetMs + sound.durationMs + v.env.releaseMs),
  )
}

/** Lowest and highest frequency the set touches — what the spectrum rail draws. */
export function frequencySpan(sound: Sound): { minHz: number; maxHz: number } {
  const hz = sound.voices
    .filter((v): v is Extract<Voice, { kind: "osc" }> => v.kind === "osc")
    .flatMap((v) => [v.pitch.startHz, v.pitch.endHz])
  return hz.length ? { minHz: Math.min(...hz), maxHz: Math.max(...hz) } : { minHz: 0, maxHz: 0 }
}

// ---------------------------------------------------------------------------
// Paired editing
// ---------------------------------------------------------------------------

/**
 * An edit, plus the mirrored edit it implies on its partner.
 *
 * Inversion pairs are the same sound with the sweep reversed, so editing one
 * has to move the other or they drift apart the first time anyone touches
 * either. Returning both edits — rather than deriving one sound from the other
 * at resolve time — keeps `resolve` dumb and leaves no feedback loop to guard
 * against.
 *
 * Only the pitch mirrors. Attack, duration and filter are character, not
 * direction, so they apply to the edited sound alone; a `close` that is
 * quieter than its `open` is a legitimate thing to want.
 */
export function pairedEdits(
  id: SoundId,
  patch: SoundDelta,
): { id: SoundId; patch: SoundDelta }[] {
  const { startHz, endHz, ...character } = patch
  const hasPitch = startHz !== undefined || endHz !== undefined

  // Character always applies to the sound that was edited.
  const out: { id: SoundId; patch: SoundDelta }[] = []
  if (Object.keys(character).length) out.push({ id, patch: character })
  if (!hasPitch) return out.length ? out : [{ id, patch }]

  const partner = partnerOf(id)
  const inverted = partner?.kind === "inversion"

  // Pitch lives on the canonical member only. Editing the derived side writes
  // the mirror image upstream rather than storing a delta that resolve() is
  // going to overwrite anyway — so the URL never carries a value that does
  // nothing, and the two can't be set to disagree.
  if (inverted && isDerivedPitch(id)) {
    const target = pitchCanonical(id)
    const mirrored: SoundDelta = {}
    if (startHz !== undefined) mirrored.endHz = startHz
    if (endHz !== undefined) mirrored.startHz = endHz
    out.push({ id: target, patch: mirrored })
    return out
  }

  const pitch: SoundDelta = {}
  if (startHz !== undefined) pitch.startHz = startHz
  if (endHz !== undefined) pitch.endHz = endHz
  out.push({ id, patch: pitch })
  return out
}

/** Merge a patch into a config, applying pair mirroring. */
export function applyEdit(config: SetConfig, id: SoundId, patch: SoundDelta): SetConfig {
  const deltas = { ...config.deltas }
  for (const edit of pairedEdits(id, patch)) {
    deltas[edit.id] = { ...deltas[edit.id], ...edit.patch }
  }
  return { ...config, deltas }
}
