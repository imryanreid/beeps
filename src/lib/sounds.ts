// ==============================================
// THE SOUND MODEL AND THE SET
// Every type the tool works in, and the eleven
// sounds themselves — what interval each sits at,
// how many voices it has, and when it should play.
//
// A sound is declared here as a *recipe*, not as
// finished numbers: semitone offsets from a base and
// a shape. A preset supplies the character, and
// resolve.ts combines the two. That split is what
// lets a preset change the whole set at once while
// the semantic relationships stay put.
//
// The `when` / `whenNot` strings are not comments.
// They ship verbatim in the agent markdown, and they
// are the most valuable thing this tool exports —
// an agent handed eleven parameter sets and no
// guidance will wire them to every event it can find.
// ==============================================

export type Waveform = "sine" | "triangle" | "square" | "sawtooth"

/** How much attention the event deserves. Drives gain and duration together. */
export type Tier = "subtle" | "notable" | "alert"

export const TIERS: Tier[] = ["subtle", "notable", "alert"]

export type SoundId =
  | "tap"
  | "toggle.on"
  | "toggle.off"
  | "open"
  | "close"
  | "send"
  | "receive"
  | "success"
  | "error"
  | "notification"
  | "delete"

export type Envelope = {
  /** Reaches single digits. That is what separates a click from a beep. */
  attackMs: number
  decayMs: number
  /** A level, 0–1 — not a time. The sustain *segment* is whatever duration is left. */
  sustain: number
  releaseMs: number
}

export type PitchEnvelope = {
  startHz: number
  endHz: number
  /** May be shorter than the sound; the pitch then holds at `endHz`. */
  sweepMs: number
}

export type OscVoice = {
  kind: "osc"
  waveform: Waveform
  pitch: PitchEnvelope
  env: Envelope
  gain: number
  /** Delay from the sound's t0. A two-note sound is two voices, not a special case. */
  startOffsetMs: number
}

export type NoiseVoice = {
  kind: "noise"
  env: Envelope
  gain: number
  startOffsetMs: number
}

export type Voice = OscVoice | NoiseVoice

export type Filter = {
  type: "lowpass" | "highpass"
  cutoffHz: number
  /** Resonance. Above ~12 a short percussive sound rings after the envelope shuts. */
  q: number
}

/** One finished sound. Every number concrete; nothing left to derive. */
export type Sound = {
  id: SoundId
  /** Summed. Never assume a length — v2's second oscillator is one more entry. */
  voices: Voice[]
  filter: Filter
  durationMs: number
  tier: Tier
  /**
   * Set by loudness.ts at resolve time, never authored.
   *
   * Live playback, the offline WAV render, the JS export and the JSON all read
   * this one number, which is what makes the file you download the sound you
   * heard.
   */
  normalizedGain: number
}

export type SoundSet = {
  presetId: string
  baseHz: number
  sounds: Sound[]
}

// ---------------------------------------------------------------------------
// The recipes
// ---------------------------------------------------------------------------

/**
 * One voice of a recipe, in semitones from the set's base frequency.
 *
 * `from` and `to` describe the *semantic* interval — the fall in `tap`, the
 * rise in `toggle.on`. A preset scales that depth but never reverses it, so
 * "confirm rises, dismiss falls" survives every character change.
 *
 * When `from === to` the note is steady and the preset supplies its own
 * intrinsic downward glide instead. That is how a two-note sound like `success`
 * gets its character without hard-coding a sweep into the semantics.
 */
export type VoiceSpec = {
  from: number
  to: number
  /** Delay from t0 as a share of the sound's duration, 0–1. */
  offsetShare: number
  /** Relative level within the sound, 0–1, before normalization. */
  gain: number
}

export type SoundSpec = {
  id: SoundId
  tier: Tier
  voices: VoiceSpec[]
  /** Force a noise transient even on presets that carry none. `delete` does. */
  forceNoise?: boolean
  /**
   * Multiplier on the preset's filter cutoff. `send` opens as it rises and
   * `receive` closes as it falls, which is the half of that pair's inversion
   * that pitch alone cannot express.
   */
  cutoffScale?: number
  /** Ships verbatim in the agent markdown. */
  when: string
  whenNot: string
}

/**
 * The set. Order is the order everything renders in — roughly by how often a
 * real app fires them, which puts `tap` first and `delete` last.
 */
export const SOUND_SPECS: SoundSpec[] = [
  {
    id: "tap",
    tier: "subtle",
    voices: [{ from: 0, to: -2, offsetShare: 0, gain: 1 }],
    when: "A discrete press that commits something small — a button, a segment, a menu item.",
    whenNot: "Hover, focus, scroll, or any pointer movement. Never on every keystroke.",
  },
  {
    id: "toggle.on",
    tier: "subtle",
    voices: [{ from: 2, to: 7, offsetShare: 0, gain: 1 }],
    when: "A binary control turning on, when the user turned it on.",
    whenNot: "Programmatic state changes, or restoring saved settings on load.",
  },
  {
    id: "toggle.off",
    tier: "subtle",
    voices: [{ from: 7, to: 2, offsetShare: 0, gain: 1 }],
    when: "The same control turning off.",
    whenNot: "Programmatic state changes, or restoring saved settings on load.",
  },
  {
    id: "open",
    tier: "subtle",
    voices: [{ from: 0, to: 5, offsetShare: 0, gain: 1 }],
    when: "A surface the user opened: menu, sheet, drawer, disclosure.",
    whenNot: "Anything that opens by itself, including tooltips on hover.",
  },
  {
    id: "close",
    tier: "subtle",
    voices: [{ from: 5, to: 0, offsetShare: 0, gain: 1 }],
    when: "The same surface dismissed.",
    whenNot: "Route changes and page navigation — those are not closes.",
  },
  {
    id: "send",
    tier: "notable",
    // Opens up as it rises: the sound thins and brightens on the way out.
    cutoffScale: 1.6,
    voices: [{ from: 4, to: 11, offsetShare: 0, gain: 1 }],
    when: "Outbound, user-initiated: a message sent, a form submitted, a job queued.",
    whenNot: "Autosave, background sync, telemetry, retries.",
  },
  {
    id: "receive",
    tier: "notable",
    // The mirror: closes as it falls, so the sound fills out on arrival.
    cutoffScale: 0.7,
    voices: [{ from: 11, to: 4, offsetShare: 0, gain: 1 }],
    when: "Inbound content arriving while the user is present and looking.",
    whenNot: "Bulk arrivals — play once for a batch, never once per item.",
  },
  {
    id: "success",
    tier: "notable",
    // Two rising notes a perfect fourth apart. Ascending reads as completion.
    voices: [
      { from: 4, to: 4, offsetShare: 0, gain: 1 },
      { from: 9, to: 9, offsetShare: 0.35, gain: 0.9 },
    ],
    when: "A user-initiated operation completed. Only on completion the user was waiting for.",
    whenNot:
      "Background success, cache warms, or anything they did not start. Never as a page-load chime.",
  },
  {
    id: "error",
    tier: "alert",
    // Two voices a semitone apart, sounding together and falling. The beating
    // is the point: unpleasant without needing to be loud.
    voices: [
      { from: 0, to: -3, offsetShare: 0, gain: 1 },
      { from: -1, to: -4, offsetShare: 0, gain: 0.85 },
    ],
    when: "An operation failed in a way the user must respond to.",
    whenNot:
      "Validation on a field they have not finished typing in. Never more than once per submit.",
  },
  {
    id: "notification",
    tier: "alert",
    // Two falling notes, the same width as success and the opposite direction.
    // Descending reads as "here is information" rather than "you did it".
    voices: [
      { from: 12, to: 12, offsetShare: 0, gain: 1 },
      { from: 7, to: 7, offsetShare: 0.4, gain: 0.95 },
    ],
    when: "An interruption that is genuinely new information.",
    whenNot:
      "Anything the user can see happening. Never when the originating tab is focused and the item is already on screen.",
  },
  {
    id: "delete",
    tier: "alert",
    forceNoise: true,
    voices: [{ from: 0, to: -12, offsetShare: 0, gain: 1 }],
    when: "Destructive removal that has actually happened.",
    whenNot: "Opening a confirmation dialog — that is `open`.",
  },
]

export const SOUND_IDS: SoundId[] = SOUND_SPECS.map((s) => s.id)

export function specFor(id: SoundId): SoundSpec {
  const spec = SOUND_SPECS.find((s) => s.id === id)
  if (!spec) throw new Error(`Unknown sound: ${id}`)
  return spec
}

// ---------------------------------------------------------------------------
// Pairs
// ---------------------------------------------------------------------------

export type PairKind = "inversion" | "contrast"

export type Pair = { a: SoundId; b: SoundId; kind: PairKind }

/**
 * Sounds that are defined against each other.
 *
 * **`a` is canonical and `b` is derived from it.** For an `inversion` pair that
 * is literal: `b`'s pitches are `a`'s resolved pitches, swapped, computed after
 * both are built. Deriving rather than declaring is what makes the inversion
 * exact — two specs that merely *look* like mirrors stop being mirrors the
 * moment a preset scales their sweeps, because each scales toward its own
 * destination.
 *
 * `contrast` is weaker and deliberately so. "Confirm rises, dismiss falls" is
 * only two-thirds of a rule: inverting `success` produces a falling perfect
 * fourth, which is already `notification`. So success and error contrast in
 * *consonance* — a consonant rise against a dissonant fall — and neither
 * derives from the other.
 */
export const PAIRS: Pair[] = [
  { a: "toggle.on", b: "toggle.off", kind: "inversion" },
  { a: "open", b: "close", kind: "inversion" },
  { a: "send", b: "receive", kind: "inversion" },
  { a: "success", b: "error", kind: "contrast" },
]

/** The other half of `id`'s pair, or null if it has none. */
export function partnerOf(id: SoundId): { id: SoundId; kind: PairKind } | null {
  for (const p of PAIRS) {
    if (p.a === id) return { id: p.b, kind: p.kind }
    if (p.b === id) return { id: p.a, kind: p.kind }
  }
  return null
}

/**
 * True when this sound's pitch is computed from its partner rather than from
 * its own spec — so its own pitch deltas are ignored, and the editor writes
 * them to the canonical member instead.
 */
export function isDerivedPitch(id: SoundId): boolean {
  return PAIRS.some((p) => p.kind === "inversion" && p.b === id)
}

/** The canonical member whose pitch drives `id`, or `id` itself. */
export function pitchCanonical(id: SoundId): SoundId {
  const p = PAIRS.find((x) => x.kind === "inversion" && x.b === id)
  return p ? p.a : id
}
