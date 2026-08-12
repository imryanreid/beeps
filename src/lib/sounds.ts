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

/**
 * A second oscillator wired into this one's FREQUENCY rather than mixed into
 * the output — frequency modulation.
 *
 * This is the only thing in the tool that makes a new timbre rather than a
 * new balance of existing ones. Everything else — layers, filter, envelope —
 * adds or removes simple waveforms, so every preset built from them is the
 * same instrument with the treble moved. FM instead generates sidebands around
 * the carrier, and where they land depends on the RATIO: whole-number ratios
 * put them on harmonics and sound like a richer version of the note, while
 * fractional ones put them between harmonics and sound like struck metal,
 * wood or glass. Two numbers span instrument families that additive synthesis
 * cannot reach at all.
 *
 * The depth falls away over its own decay, which is what makes an FM sound
 * bloom and then settle rather than buzzing evenly throughout. A bell is
 * mostly this: a bright inharmonic attack collapsing to a near-sine.
 */
export type FmSpec = {
  /** The modulator's pitch — already ratio-scaled and gliding with the carrier. */
  pitch: PitchEnvelope
  /** Peak deviation in Hz. */
  depthHz: number
  /** How long the deviation takes to fall away. Usually shorter than the note. */
  decayMs: number
}

export type OscVoice = {
  kind: "osc"
  waveform: Waveform
  pitch: PitchEnvelope
  env: Envelope
  gain: number
  /** Frequency modulation, when the preset's layer asks for it. See FmSpec. */
  fm?: FmSpec
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

/**
 * A room around the sound: a short delay fed back on itself, damped a little
 * more on each pass.
 *
 * Dry against wet is a bigger perceived difference than most timbral changes,
 * and it is the one axis the tool had none of — every preset was recorded, so
 * to speak, in an anechoic chamber. A `delayMs` in the tens of milliseconds
 * reads as a room rather than as an echo; past about 80 ms it starts to read
 * as a repeat, which is a different and much more intrusive thing in an
 * interface.
 *
 * The tail this adds is real audible time and counts against DURATION_BUDGET.
 * That is a genuine constraint rather than bookkeeping: a subtle tap trailing
 * 200 ms of room has overstayed exactly as surely as a long one would have,
 * and pretending otherwise would make the tool's own duration warning lie.
 */
export type SpaceSpec = {
  delayMs: number
  /** How much comes back round, 0 to below 1. Above ~0.5 it stops decaying. */
  feedback: number
  /** Wet level against the dry signal. */
  mix: number
  /** Lowpass inside the feedback loop, so repeats darken the way a room does. */
  dampingHz: number
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
  /** The room, when the preset carries one. See SpaceSpec. */
  space?: SpaceSpec
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
 * `ding` is one note struck with an overtone sounding *alongside* it and
 * ringing on past it. The simultaneity is the whole difference between a
 * doorbell and an increment — two notes in sequence read as a step however
 * short the gap between them.
 *
 * `expand`/`collapse` add a filter sweep on top of the pitch move: the sound
 * opens up as it rises, or closes down as it falls. A menu appearing should
 * feel like it widens, not merely like it goes up. They are the one pair whose
 * mirror is deliberately NOT symmetric in magnitude — see FILTER_SWEEP.
 *
 * Every "down" shape is the exact mirror of its "up" twin, which is what makes
 * the pairs inversions by construction rather than by careful authoring.
 */
export type Shape =
  "flat" | "ding" | "ascend" | "descend" | "scoopUp" | "scoopDown" | "expand" | "collapse"

/** One note of a resolved shape, in semitones from the set's base. */
export type NoteSpec = {
  from: number
  to: number
  /** Delay from t0 as a share of the sound's duration, 0–1. */
  offsetShare: number
  /** Relative level, 0–1, before normalization. */
  gain: number
  /**
   * Multiplier on decay and release for this note alone.
   *
   * Above 1 the note rings on past its siblings, which is what separates a
   * struck bell from a chord: the overtone is still sounding when the
   * fundamental under it has gone.
   */
  tail?: number
  /**
   * Hold this pitch exactly, ignoring the preset's intrinsic glide.
   *
   * A note that declares no interval normally takes a small downward glide so
   * it still sounds like it belongs to its preset. A struck bell does not do
   * that — it rings at one pitch — and applying the glide anyway made
   * `notification` audibly descend, which fought the whole point of it being
   * the positive one.
   */
  steady?: boolean
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
  const note = (
    from: number,
    to: number,
    offsetShare = 0,
    gain = 1,
    extra: { tail?: number; steady?: boolean } = {},
  ): NoteSpec => ({ from, to, offsetShare, gain, ...extra })
  switch (shape) {
    case "flat":
      return [note(center, center)]
    case "ding":
      // One note struck, with an overtone sounding WITH it rather than after
      // it, and ringing on past it. That simultaneity is the whole difference
      // between a doorbell and an increment — two notes in sequence read as a
      // step, however short the gap.
      return [
        note(center, center, 0, 1, { steady: true }),
        note(center + travel, center + travel, 0, 0.45, { tail: 1.3, steady: true }),
      ]
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

/**
 * How much of the sound the pitch move occupies, as a multiplier on the
 * preset's `sweepShare`.
 *
 * This exists because `expand` and `scoopUp` produced *literally the same
 * notes* — same branch of `notesFor`, same travel — so `open` and `toggle.on`
 * were one sound transposed three semitones, in every preset. Four names, two
 * behaviours. Separating them by centre alone was never going to work; they
 * had to move differently.
 *
 * A **scoop** is a gesture: the pitch arrives early and the rest of the sound
 * holds it, the way a thrown thing is fastest as it leaves your hand. An
 * **expand** is a size change: the whole sound is still moving when it ends.
 * Same interval, opposite feel, and about a 3x spread in glide time — which is
 * audible where three semitones of transposition is not.
 */
export function glideShareFor(shape: Shape): number {
  switch (shape) {
    case "scoopUp":
    case "scoopDown":
      return 0.5
    case "expand":
    case "collapse":
      return 1.5
    default:
      return 1
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
  /**
   * Per-sound length, as a multiplier on the tier's envelope. Default 1.
   *
   * The tier sets how much attention a sound asks for, and that is genuinely
   * shared — but two sounds can want the same attention at different lengths.
   * A toggle is a flick; opening a drawer is a surface arriving. Both are
   * `subtle`, and before this they were the same length to the millisecond.
   */
  lengthScale?: number
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
    // A ding, not an increment. Two notes in sequence read as a step, and it
    // was reading as a quieter cousin of `success` — which ascends through the
    // same pitches. Struck-with-an-overtone is unmistakably its own thing.
    shape: "ding",
    tier: "alert",
    center: 7,
    // A fifth. That is the third harmonic, so the overtone sits where a real
    // struck object would put it.
    travel: 7,
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
    // Further than a toggle travels, and gliding for three times as long. A
    // drawer coming out is a bigger move than a switch flipping, and the two
    // were previously identical in both.
    travel: 7,
    lengthScale: 1.15,
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
    travel: 7,
    lengthScale: 1.15,
    when: "The same surface dismissed.",
    whenNot: "Route changes and page navigation — those are not closes.",
  },
  {
    id: "send",
    valence: "positive",
    register: "lower",
    shape: "scoopUp",
    tier: "notable",
    // A declared centre is not where the sound sits. `receive` is the inverted
    // half of this pair, so it spans the same notes upside down and its middle
    // lands a fourth ABOVE this number — which is how it ended up overlapping
    // `close`. Dropping the pair is what actually makes "lower" true of both.
    center: -9,
    travel: 7,
    // The two longest sounds that are not alerts. A message leaving is the most
    // consequential thing in the set that is not an interruption, and at tier
    // length it went by too fast to register as a gesture at all.
    lengthScale: 1.3,
    when: "Outbound, user-initiated: a message sent, a form submitted, a job queued.",
    whenNot: "Autosave, background sync, telemetry, retries.",
  },
  {
    id: "receive",
    valence: "positive",
    register: "lower",
    shape: "scoopDown",
    tier: "notable",
    center: -9,
    travel: 7,
    lengthScale: 1.3,
    when: "Inbound content arriving while the user is present and looking.",
    whenNot: "Bulk arrivals — play once for a batch, never once per item.",
  },
  {
    id: "toggle.on",
    valence: "neutral",
    register: "higher",
    shape: "scoopUp",
    tier: "subtle",
    // Lands on the octave, where `open` used to land too — both arrived at +9
    // and differed only in where they set off, which on a preset with a short
    // glide is no difference at all. Consonance was checked when these were
    // tuned; collision was not.
    center: 8,
    // The tightest move in the set, and the shortest sound. A switch is the
    // one thing here with no travel of its own — it just changes state.
    travel: 4,
    lengthScale: 0.94,
    when: "A binary control turning on, when the user turned it on.",
    whenNot: "Programmatic state changes, or restoring saved settings on load.",
  },
  {
    id: "toggle.off",
    valence: "neutral",
    register: "higher",
    shape: "scoopDown",
    tier: "subtle",
    center: 8,
    travel: 4,
    lengthScale: 0.94,
    when: "The same control turning off.",
    whenNot: "Programmatic state changes, or restoring saved settings on load.",
  },
  {
    id: "success",
    valence: "positive",
    register: "mid",
    shape: "ascend",
    tier: "notable",
    // Below `open`, which it used to climb through. Both rise a similar
    // distance from a similar place, and the only thing keeping them apart was
    // that one steps and the other glides — which holds on Soft and stops
    // holding on any preset that compresses its glide toward a jump.
    center: 0,
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
    // Off `tap`'s note, which it used to sit exactly on. Both are flat, so
    // pitch was the only thing left to tell them apart and there was none of
    // it — on a pure sine the dissonant voice beat audibly against the clean
    // tap and covered for it, but on Retro's squares and Glassy's partials
    // the added harshness landed in harmonics that were already there and the
    // two collapsed into one sound at two lengths. A minor third down is
    // still mid-register and unmistakably not `tap`.
    center: -4,
    travel: 0,
    when: "An operation failed in a way the user must respond to.",
    whenNot:
      "Validation on a field they have not finished typing in. Never more than once per submit.",
  },
  {
    id: "delete",
    // NEUTRAL, not negative. It was the only other negative sound, so it
    // inherited `error`'s dissonant voice and dark, hard filter and came out
    // as error-plus-a-step-down. Removing something is not a failure — it is
    // a thing being set down, and it should sound like one.
    valence: "neutral",
    register: "mid",
    // A continuous fall rather than a stepped one, which is the difference
    // between putting something down and announcing two facts about it.
    shape: "scoopDown",
    tier: "notable",
    // Lands a full octave below base, and falls further to get there. It used
    // to share `receive`'s shape, travel, tier and length while sitting three
    // semitones away — the same sound twice, which is exactly how it read on
    // any preset short enough to suppress pitch. Dropping the landing below
    // everything else in the set is what makes it final.
    center: -12,
    travel: 12,
    // The transient is the thud of it landing. Worth keeping even though the
    // valence no longer asks for one.
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

export type Pair = {
  a: SoundId
  b: SoundId
  kind: PairKind
  /**
   * How far below its twin the derived member sits, in semitones.
   *
   * The contour still mirrors exactly — same interval, opposite direction —
   * but the whole gesture is transposed down. Without it a pair occupies one
   * pitch range traversed both ways, which means the falling member *starts*
   * higher than the rising one and reads as the higher of the two however it
   * travels. Dropping it is what makes "on is higher, off is lower" true of
   * the sound rather than only of its direction.
   *
   * Zero on send/receive: that pair reads as two halves of one exchange rather
   * than as a state and its opposite, and dropping `receive` made it sound
   * like a lesser event instead of a matching one.
   */
  dropSemitones?: number
}

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
  // A perfect fourth. Three semitones left `close` starting marginally ABOVE
  // `open` — a falling gesture mirroring a rising one begins where the other
  // ends, so a small drop moves the landing without moving the onset. Five
  // puts it lower at both ends, which is what "off is lower" has to mean.
  { a: "open", b: "close", kind: "inversion", dropSemitones: 7 },
  { a: "send", b: "receive", kind: "inversion", dropSemitones: 0 },
  { a: "toggle.on", b: "toggle.off", kind: "inversion", dropSemitones: 4 },
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

/** How far `id` sits below its canonical twin. Zero unless it is a derived member. */
export function pairDropSemitones(id: SoundId): number {
  const p = PAIRS.find((x) => x.kind === "inversion" && x.b === id)
  return p?.dropSemitones ?? 0
}
