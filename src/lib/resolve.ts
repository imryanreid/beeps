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
  pairDropSemitones,
  partnerOf,
  pitchCanonical,
  type Envelope,
  type Sound,
  type SoundId,
  type Tier,
  type SoundSet,
  type Voice,
  type Valence,
  type NoteSpec,
  notesFor,
  opensFilter,
  closesFilter,
} from "./sounds.js"
import {
  DEFAULT_PRESET,
  PRESETS,
  type PresetDef,
  type PresetId,
  type PresetLayer,
} from "./presets.js"
import { envelopeSegments } from "../runtime/beeps.js"

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
  /** How long the pitch takes to travel from start to end. */
  sweepMs?: number
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
  sweepMs: [1, 2000],
  gainTrimDb: [-40, 12],
  cutoffHz: [80, 20000],
  q: [0.0001, 20],
} as const

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * The lowest note the derivation will produce, whatever a preset asks for.
 *
 * A preset's `sweepScale` multiplies the semantic interval, and an aggressive
 * one on an already-low sound compounds: Sci-Fi's 3x on `send`'s seven-semitone
 * scoop put its start at nineteen semitones below base — 274 Hz, inside the
 * small-speaker rolloff and effectively silent on a laptop. Clamping here means
 * a preset can be as dramatic as it likes without any sound diving out of
 * audibility, and it applies to every preset rather than being tuned away on
 * the one that happened to trip it.
 */
export const MIN_MUSICAL_HZ = 330

/** Equal temperament. The whole set is intervals from one base. */
export const semitonesToHz = (baseHz: number, semitones: number): number =>
  baseHz * Math.pow(2, semitones / 12)

const dbToLinear = (db: number) => Math.pow(10, db / 20)

/**
 * How long a sound is: however long its envelope takes.
 *
 * Duration used to be authored separately, with the envelope squeezed to fit
 * it. That made the editor unusable — dragging attack up rescaled all three
 * segments, so the slider landed somewhere you did not put it and decay and
 * release moved on their own. You were fighting the fitter rather than editing
 * a sound.
 *
 * Now it runs the other way: attack, decay and release are what you set, and
 * the length follows. That is also the more honest model — a sound is over when
 * it has decayed, and a "duration" that could not change what you heard was a
 * control doing nothing.
 */
export function envelopeMs(env: Envelope): number {
  return env.attackMs + env.decayMs + env.releaseMs
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
export function sweepStartSemitones(v: NoteSpec, preset: PresetDef): number {
  // A struck note holds its pitch. Applying the intrinsic glide to a `ding`
  // made it fall by a semitone and a half, which read as descending — the
  // opposite of what the positive sound in the set should do.
  if (v.steady) return v.to
  if (v.from === v.to) return v.to + preset.intrinsicSweep
  return v.to + (v.from - v.to) * preset.sweepScale
}

/**
 * What being good, bad or neither does to a sound.
 *
 * Deliberately NOT pitch — the shape owns that. Valence owns harmony and
 * timbre, so `error` is dissonant because it is negative rather than because
 * somebody wrote a dissonance into that one sound. Add a twelfth negative
 * sound and it gets the same treatment without touching this function.
 */
export const VALENCE: Record<
  Valence,
  { cutoffScale: number; qScale: number; dissonanceSemitones: number | null }
> = {
  // Brighter and clean. Nothing added — consonance is the absence of the
  // beating below, not an extra voice.
  //
  // The spread is deliberately narrow. At 1.3 against 1.0 the positive half of
  // a pair audibly outshone its neutral twin, so `open` and `close` read as
  // happy-and-sad rather than as two halves of one gesture. Valence should
  // colour a sound, not grade it.
  positive: { cutoffScale: 1.18, qScale: 1, dissonanceSemitones: null },
  neutral: { cutoffScale: 1, qScale: 1, dissonanceSemitones: null },
  // Darker, harder, and a voice a semitone away so the two beat against each
  // other. That roughness is unpleasant in exactly the way a failure should
  // be, and it gets there without being loud.
  negative: { cutoffScale: 0.78, qScale: 1.45, dissonanceSemitones: -1 },
}

/**
 * Where the filter travels for `expand` and `collapse`.
 *
 * **Deliberately not symmetric**, and this is the one place the pair rule is
 * broken on purpose. Opening and closing a filter are not perceptual mirrors:
 * a wide sweep upward reads as blooming, and the same sweep downward reads as
 * being smothered — a power-cut rather than a lid settling. Mirrored at 6:1
 * both ways, `close` sounded like an accident.
 *
 * So `expand` blooms and `collapse` merely settles. The DIRECTION still
 * mirrors, which is what carries the meaning; the magnitude does not, which is
 * what keeps `close` neutral instead of sounding like a failure.
 */
const FILTER_SWEEP = {
  expandFrom: 0.6,
  expandTo: 2.3,
  collapseFrom: 1.25,
  collapseTo: 0.72,
}

/**
 * The authored envelope for a sound: the preset's shape, scaled to the tier,
 * with any explicit edit winning outright.
 *
 * Decay and release scale with the tier; attack does not. Attack is character —
 * it is what makes a sound a click rather than a beep — and stretching it for
 * an alert would just make the alert mushy.
 */
export function envelopeFor(preset: PresetDef, tier: Tier, delta: SoundDelta = {}): Envelope {
  const scale = preset.envScale[tier]
  return {
    attackMs: clamp(delta.attackMs ?? preset.attackMs, ...LIMITS.attackMs),
    decayMs: clamp(delta.decayMs ?? preset.decayMs * scale, ...LIMITS.decayMs),
    sustain: preset.sustain,
    releaseMs: clamp(delta.releaseMs ?? preset.releaseMs * scale, ...LIMITS.releaseMs),
  }
}

/**
 * Layer gains, scaled so the stack sums to 1.
 *
 * Without this a three-layer preset would be roughly three times louder than a
 * one-layer one before normalization ever ran, and the loud ones would clip on
 * the way to being measured. Normalising here means a preset's `gain` table
 * still means what it says whatever its stack looks like.
 */
function normalizedLayers(preset: PresetDef): { layer: PresetLayer; gain: number }[] {
  const total = preset.layers.reduce((sum, l) => sum + l.gain, 0) || 1
  return preset.layers.map((layer) => ({ layer, gain: layer.gain / total }))
}

function buildVoices(
  spec: (typeof SOUND_SPECS)[number],
  preset: PresetDef,
  baseHz: number,
  env: Envelope,
  durationMs: number,
  delta: SoundDelta,
): Voice[] {
  const notes = notesFor(spec.shape, spec.center, spec.travel)
  const primary = notes[0]
  const derivedStart = semitonesToHz(baseHz, sweepStartSemitones(primary, preset))
  const derivedEnd = semitonesToHz(baseHz, primary.to)

  // An explicit pitch override retunes the whole sound. Secondary notes move by
  // the same ratio, so a two-note sound keeps the interval between its notes
  // rather than collapsing onto the primary.
  const startHz = delta.startHz ?? derivedStart
  const endHz = delta.endHz ?? derivedEnd
  const ratio = (startHz + endHz) / (derivedStart + derivedEnd)

  const sweepMs = clamp(
    delta.sweepMs ?? (env.decayMs + env.releaseMs) * preset.sweepShare,
    ...LIMITS.sweepMs,
  )

  const layers = normalizedLayers(preset)
  const voices: Voice[] = []

  // Every semantic note x every preset layer. The note carries the meaning —
  // which interval, rising or falling — and the layer carries the character.
  // Keeping them separate is what lets a preset change the instrument without
  // touching what any sound MEANS.
  for (const [i, note] of notes.entries()) {
    const noteStart =
      i === 0 ? startHz : semitonesToHz(baseHz, sweepStartSemitones(note, preset)) * ratio
    const noteEnd = i === 0 ? endHz : semitonesToHz(baseHz, note.to) * ratio

    for (const [index, { layer, gain }] of layers.entries()) {
      const shift = Math.pow(2, layer.interval / 12)
      // `tail` lets an upper partial outlast the note under it, which is what
      // a bell does and the only reason Glassy sounds like glass. A note can
      // ask for one too — that is how `ding`'s overtone rings on.
      const tail = (layer.tail ?? 1) * (note.tail ?? 1)
      voices.push({
        kind: "osc",
        waveform: layer.waveform,
        pitch: {
          // The layer shift is applied before the floor so an octave-up layer
          // is never dragged down by a limit meant for the note beneath it.
          startHz: clamp(Math.max(noteStart * shift, MIN_MUSICAL_HZ), ...LIMITS.freqHz),
          endHz: clamp(Math.max(noteEnd * shift, MIN_MUSICAL_HZ), ...LIMITS.freqHz),
          sweepMs,
        },
        env:
          tail === 1
            ? env
            : { ...env, decayMs: env.decayMs * tail, releaseMs: env.releaseMs * tail },
        gain: note.gain * gain * preset.gain[spec.tier],
        startOffsetMs: note.offsetShare * durationMs,
        ...(layer.detuneCents ? { detuneCents: layer.detuneCents } : {}),
        layer: index,
      })
    }
  }

  // Negative valence beats a second voice against the first. It rides the
  // primary note only — spreading it across every note of a two-note figure
  // would turn a sour edge into a cluster.
  const dissonance = VALENCE[spec.valence].dissonanceSemitones
  if (dissonance !== null) {
    const shift = Math.pow(2, dissonance / 12)
    const first = voices.find((v) => v.kind === "osc")
    if (first && first.kind === "osc") {
      voices.push({
        ...first,
        pitch: {
          ...first.pitch,
          startHz: clamp(first.pitch.startHz * shift, ...LIMITS.freqHz),
          endHz: clamp(first.pitch.endHz * shift, ...LIMITS.freqHz),
        },
        gain: first.gain * 0.85,
      })
    }
  }

  // The noise layer, when the preset carries one or the sound insists. `delete`
  // insists: an octave drop with no transient reads as a swoop, not a removal.
  const noise = preset.noise ?? (spec.forceNoise ? { amount: 0.2, decayMs: 8 } : null)
  if (noise) {
    voices.push({
      kind: "noise",
      env: { attackMs: 0.5, decayMs: noise.decayMs, sustain: 0, releaseMs: 4 },
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
function invertPitches(derived: Sound, canonical: Sound, dropSemitones: number): Sound {
  const source = canonical.voices.filter((v) => v.kind === "osc")
  // The whole gesture drops, so the interval it travels is untouched — it just
  // happens lower. That is what makes "off is lower than on" true of the sound
  // and not only of its direction.
  const drop = Math.pow(2, -dropSemitones / 12)
  let i = 0
  return {
    ...derived,
    voices: derived.voices.map((v) => {
      if (v.kind !== "osc") return v
      const from = source[i++]
      if (!from || from.kind !== "osc") return v
      return {
        ...v,
        pitch: {
          ...v.pitch,
          startHz: clamp(Math.max(from.pitch.endHz * drop, MIN_MUSICAL_HZ), ...LIMITS.freqHz),
          endHz: clamp(Math.max(from.pitch.startHz * drop, MIN_MUSICAL_HZ), ...LIMITS.freqHz),
        },
      }
    }),
  }
}

/**
 * The filter, carrying both valence and the shape's sweep.
 *
 * `expand` and `collapse` are the only shapes that move it. They start where a
 * static filter would sit and travel outward or inward, so `open` genuinely
 * opens rather than just going up — which is the difference between a menu
 * that appears and one that merely rises.
 */
function buildFilter(
  spec: (typeof SOUND_SPECS)[number],
  preset: PresetDef,
  delta: SoundDelta,
): Sound["filter"] {
  const valence = VALENCE[spec.valence]
  const cutoffHz = clamp(
    delta.cutoffHz ?? preset.filterCutoffHz * valence.cutoffScale,
    ...LIMITS.cutoffHz,
  )
  const q = clamp(delta.q ?? preset.filterQ * valence.qScale, ...LIMITS.q)

  if (opensFilter(spec.shape)) {
    return {
      type: preset.filterType,
      cutoffHz: clamp(cutoffHz * FILTER_SWEEP.expandFrom, ...LIMITS.cutoffHz),
      endCutoffHz: clamp(cutoffHz * FILTER_SWEEP.expandTo, ...LIMITS.cutoffHz),
      q,
    }
  }
  if (closesFilter(spec.shape)) {
    return {
      type: preset.filterType,
      cutoffHz: clamp(cutoffHz * FILTER_SWEEP.collapseFrom, ...LIMITS.cutoffHz),
      endCutoffHz: clamp(cutoffHz * FILTER_SWEEP.collapseTo, ...LIMITS.cutoffHz),
      q,
    }
  }
  return { type: preset.filterType, cutoffHz, q }
}

/** Preset + deltas → the finished set. `normalizedGain` is filled in later. */
export function resolve(config: SetConfig): SoundSet {
  const preset = PRESETS[config.presetId] ?? PRESETS[DEFAULT_PRESET]
  const baseHz = clamp(config.baseHz ?? preset.baseHz, ...LIMITS.baseHz)

  const built: Sound[] = SOUND_SPECS.map((spec) => {
    const delta = config.deltas[spec.id] ?? {}
    // The envelope decides the length, not the other way round. See envelopeMs.
    const env = envelopeFor(preset, spec.tier, delta)
    const durationMs = envelopeMs(env)

    const trim = delta.gainTrimDb === undefined ? 1 : dbToLinear(delta.gainTrimDb)
    const voices = buildVoices(spec, preset, baseHz, env, durationMs, delta).map((v) => ({
      ...v,
      gain: v.gain * trim,
    }))

    return {
      id: spec.id,
      voices,
      filter: buildFilter(spec, preset, delta),
      durationMs,
      glide: preset.glide,
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
    if (canonical && derived) {
      byId.set(pair.b, invertPitches(derived, canonical, pair.dropSemitones ?? 0))
    }
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
 * the nominal figure would let a sound quietly exceed the line it is being
 * checked against — and, on a percussive envelope, would also count silence
 * the synthesis never plays.
 *
 * The segment arithmetic comes from the runtime rather than being repeated
 * here, so the warning always measures exactly what the synthesis does.
 */
export function soundingMs(sound: Sound): number {
  return Math.max(
    ...sound.voices.map(
      (v) => v.startOffsetMs + envelopeSegments(v.env, sound.durationMs).totalMs,
    ),
  )
}

/**
 * How long a sound in each tier may run — and how short it may be.
 *
 * The lower bound is the half nobody else checks, and it is a real limit
 * rather than taste. The ear integrates loudness over roughly 100-200 ms, so a
 * burst shorter than that is heard as quieter than the identical waveform held
 * longer — by up to 10-15 dB at the very short end. Below about 70 ms you are
 * not making a sound subtle, you are making it inaudible and getting no
 * loudness back for the room you saved.
 *
 * The upper bound used to be a flat 200 ms for everything, which was wrong.
 * That figure comes from `tap` firing on every button press, and applying it
 * to `notification` was over-generalising from the noisiest case. Real shipped
 * UI sound is far longer: macOS system alerts run 0.5-1.5 s, iOS send and
 * receive around 0.5-0.8 s, Slack's ding about 0.5 s. Sounds reserved for
 * moments — a save completing, a message arriving — are not competing with the
 * next interaction, so they can afford to be figures rather than blips.
 *
 * Only the subtle tier still fires in succession, and only it keeps a tight
 * ceiling.
 */
export const DURATION_BUDGET: Record<Tier, { minMs: number; maxMs: number }> = {
  subtle: { minMs: 70, maxMs: 180 },
  // 450, because a notable sound accompanies something the user started and is
  // waiting on — it should not outlast their "did that work?" attention, which
  // is about half a second.
  notable: { minMs: 90, maxMs: 450 },
  alert: { minMs: 120, maxMs: 700 },
}

export type DurationVerdict = "short" | "ok" | "long"

/** Whether a sound sits inside its tier's window, and which way it misses. */
export function durationVerdict(sound: Sound): DurationVerdict {
  const budget = DURATION_BUDGET[sound.tier]
  const ms = soundingMs(sound)
  if (ms < budget.minMs) return "short"
  if (ms > budget.maxMs) return "long"
  return "ok"
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
    // Undo the register drop on the way up, or every edit to the derived side
    // would walk the canonical member down by another few semitones.
    const lift = Math.pow(2, pairDropSemitones(id) / 12)
    const mirrored: SoundDelta = {}
    if (startHz !== undefined) mirrored.endHz = startHz * lift
    if (endHz !== undefined) mirrored.startHz = endHz * lift
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
