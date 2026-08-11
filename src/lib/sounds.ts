// ==============================================
// THE SOUND MODEL AND THE SET
// Every type the tool works in, and the eleven
// sounds themselves — what interval each sits at,
// how many voices it has, and when it should play.
//
// Each sound is declared on three axes, and nothing
// else: VALENCE (is this good, bad or neither),
// REGISTER (roughly where it sits), and SHAPE (what
// the pitch does). Everything audible is derived from
// those plus a preset — no sound carries hand-tuned
// frequencies.
//
// The axes are load-bearing rather than descriptive.
// Valence is why `error` is dissonant: it is not a
// special case written into that one sound, it falls
// out of being negative, so a twelfth negative sound
// gets the same treatment for free. Shape is why the
// pairs cannot drift: `scoopDown` is *defined* as the
// mirror of `scoopUp`, so open/close, send/receive and
// toggle on/off invert by construction.
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
  /**
   * Fine offset in cents, applied on top of the pitch envelope.
   *
   * Only a preset layer sets this, and only for beating: two voices a few
   * cents apart drift in and out of phase with each other, which is the whole
   * of what "warm" means on a synthesizer. It cannot be expressed as a
   * frequency, because it has to track the sweep.
   */
  detuneCents?: number
  /**
   * Which preset layer produced this voice. 0 is the note itself; anything
   * above is colour — an octave, a fifth, a detuned twin.
   *
   * The editor uses it to find the voice a slider should address, so a
   * three-layer preset does not hand you the shimmer to edit instead of the
   * note.
   */
  layer: number
}

export type NoiseVoice = {
  kind: "noise"
  env: Envelope
  gain: number
  startOffsetMs: number
}

/** How the pitch travels. See `PresetDef.glide`. */
export type Glide = "smooth" | "stepped"

export type Voice = OscVoice | NoiseVoice

export type Filter = {
  type: "lowpass" | "highpass"
  cutoffHz: number
  /**
   * Where the cutoff travels to, when the shape sweeps it.
   *
   * Absent on a static filter. Present for `expand` and `collapse`, which is
   * how a menu appearing feels like it *widens* rather than merely rising —
   * pitch alone cannot express opening out.
   */
  endCutoffHz?: number
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
  glide: Glide
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
 * Is this event good, bad, or neither?
 *
 * Drives harmony and timbre, not pitch: positive brightens and stays
 * consonant, negative darkens, hardens and adds a voice a semitone away so the
 * two beat against each other. Orthogonal to `Tier` — a notification is
 * positive AND loud; an error is negative AND loud; a tap is neutral and
 * quiet.
 */
export type Valence = "positive" | "neutral" | "negative"

/** Roughly where the sound sits. A label for people; `center` is the truth. */
export type Register = "lower" | "mid" | "higher"

/**
 * What the pitch does.
 *
 * `ascend`/`descend` are stepped — two distinct notes, the way a doorbell or a
 * chime moves. `scoopUp`/`scoopDown` are continuous, one note bending into
 * another, which is the iMessage send-and-receive gesture. Both go the same
 * direction and they sound nothing alike, which is the point of having both.
 *
 * `expand`/`collapse` add a filter sweep on top of the pitch move: the sound
 * opens up as it rises, or closes down as it falls. A menu appearing should
 * feel like it widens, not merely like it goes up.
 *
 * Every "down" shape is the exact mirror of its "up" twin, which is what makes
 * the pairs inversions by construction rather than by careful authoring.
 */
export type Shape =
  "flat" | "ascend" | "descend" | "scoopUp" | "scoopDown" | "expand" | "collapse"

/** One note of a resolved shape, in semitones from the set's base. */
export type NoteSpec = {
  from: number
  to: number
  /** Delay from t0 as a share of the sound's duration, 0–1. */
  offsetShare: number
  /** Relative level, 0–1, before normalization. */
  gain: number
}

/** How far into a sound its second note lands, for the stepped shapes. */
export const SECOND_NOTE_SHARE = 0.35

/**
 * The notes a shape produces, in semitones from base.
 *
 * The mirrored shapes are written as one expression each so the inversion is
 * structural. Two hand-written specs that merely look like mirrors stop being
 * mirrors the moment anything scales them — which is exactly what happened the
 * first time this was built.
 */
export function notesFor(shape: Shape, center: number, travel: number): NoteSpec[] {
  const note = (from: number, to: number, offsetShare = 0, gain = 1): NoteSpec => ({
    from,
    to,
    offsetShare,
    gain,
  })
  switch (shape) {
    case "flat":
      return [note(center, center)]
    case "ascend":
      return [
        note(center, center),
        note(center + travel, center + travel, SECOND_NOTE_SHARE, 0.9),
      ]
    case "descend":
      return [
        note(center + travel, center + travel),
        note(center, center, SECOND_NOTE_SHARE, 0.9),
      ]
    case "scoopUp":
    case "expand":
      return [note(center, center + travel)]
    case "scoopDown":
    case "collapse":
      return [note(center + travel, center)]
  }
}

/** Shapes that sweep the filter as well as the pitch. */
export const opensFilter = (shape: Shape): boolean => shape === "expand"
export const closesFilter = (shape: Shape): boolean => shape === "collapse"

export type SoundSpec = {
  id: SoundId
  valence: Valence
  register: Register
  shape: Shape
  tier: Tier
  /** Semitones from base. The sound's home note. */
  center: number
  /** How far the shape travels, in semitones. Always positive; shape signs it. */
  travel: number
  /** Force a noise transient even on presets that carry none. */
  forceNoise?: boolean
  /** Ships verbatim in the agent markdown. */
  when: string
  whenNot: string
}

/**
 * The set, in the order it renders. Pairs sit adjacent so an inversion can be
 * heard by playing two rows in a row.
 */
export const SOUND_SPECS: SoundSpec[] = [
  {
    id: "tap",
    valence: "neutral",
    register: "mid",
    shape: "flat",
    tier: "subtle",
    center: 0,
    travel: 0,
    when: "A discrete press that commits something small — a button, a segment, a menu item.",
    whenNot: "Hover, focus, scroll, or any pointer movement. Never on every keystroke.",
  },
  {
    id: "notification",
    valence: "positive",
    register: "higher",
    shape: "ascend",
    tier: "alert",
    center: 9,
    travel: 3,
    when: "An interruption that is genuinely new information.",
    whenNot:
      "Anything the user can see happening. Never when the originating tab is focused and the item is already on screen.",
  },
  {
    id: "open",
    valence: "positive",
    register: "mid",
    shape: "expand",
    tier: "subtle",
    center: 2,
    travel: 5,
    when: "A surface the user opened: menu, sheet, drawer, disclosure.",
    whenNot: "Anything that opens by itself, including tooltips on hover.",
  },
  {
    id: "close",
    valence: "neutral",
    register: "mid",
    shape: "collapse",
    tier: "subtle",
    center: 2,
    travel: 5,
    when: "The same surface dismissed.",
    whenNot: "Route changes and page navigation — those are not closes.",
  },
  {
    id: "send",
    valence: "positive",
    register: "lower",
    shape: "scoopUp",
    tier: "notable",
    center: -5,
    travel: 7,
    when: "Outbound, user-initiated: a message sent, a form submitted, a job queued.",
    whenNot: "Autosave, background sync, telemetry, retries.",
  },
  {
    id: "receive",
    valence: "positive",
    register: "lower",
    shape: "scoopDown",
    tier: "notable",
    center: -5,
    travel: 7,
    when: "Inbound content arriving while the user is present and looking.",
    whenNot: "Bulk arrivals — play once for a batch, never once per item.",
  },
  {
    id: "toggle.on",
    valence: "neutral",
    register: "higher",
    shape: "scoopUp",
    tier: "subtle",
    center: 5,
    travel: 5,
    when: "A binary control turning on, when the user turned it on.",
    whenNot: "Programmatic state changes, or restoring saved settings on load.",
  },
  {
    id: "toggle.off",
    valence: "neutral",
    register: "higher",
    shape: "scoopDown",
    tier: "subtle",
    center: 5,
    travel: 5,
    when: "The same control turning off.",
    whenNot: "Programmatic state changes, or restoring saved settings on load.",
  },
  {
    id: "success",
    valence: "positive",
    register: "mid",
    shape: "ascend",
    tier: "notable",
    center: 4,
    travel: 5,
    when: "A user-initiated operation completed. Only on completion the user was waiting for.",
    whenNot:
      "Background success, cache warms, or anything they did not start. Never as a page-load chime.",
  },
  {
    id: "error",
    valence: "negative",
    register: "mid",
    shape: "flat",
    tier: "alert",
    center: 0,
    travel: 0,
    when: "An operation failed in a way the user must respond to.",
    whenNot:
      "Validation on a field they have not finished typing in. Never more than once per submit.",
  },
  {
    id: "delete",
    valence: "negative",
    register: "mid",
    shape: "descend",
    tier: "alert",
    center: -12,
    travel: 12,
    forceNoise: true,
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
  { a: "open", b: "close", kind: "inversion" },
  { a: "send", b: "receive", kind: "inversion" },
  { a: "toggle.on", b: "toggle.off", kind: "inversion" },
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
