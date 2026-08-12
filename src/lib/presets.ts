// ==============================================
// CHARACTER PRESETS
// Nine of them, as plain data.
//
// A preset applies to the WHOLE set: base frequency,
// envelope shape, filter, noise, per-tier gain and
// envelope scaling — and its LAYERS, which are what
// make one preset sound like a different instrument
// rather than like the last one with the treble
// adjusted.
//
// Layers are the important part. Every sound in the
// set is defined semantically as one or two notes at
// musical intervals from the base; a preset expands
// each of those into a small stack — a detuned twin
// for warmth, an octave that rings on for shimmer, a
// fifth for the sci-fi stack. Without them, Glassy is
// Soft with a brighter filter. With them, it is a
// bell.
//
// Nothing here is a code branch, and nothing anywhere
// branches on a preset id. A tenth preset is a tenth
// entry in PRESETS and nothing else.
//
// These numbers are a considered starting point.
// Presets are the highest-taste, lowest-code part of
// this product and they get finished by ear.
// ==============================================
import type { Tier, Waveform } from "./sounds.js"

export type PresetId =
  "soft" | "crisp" | "minimal" | "warm" | "bloopy" | "glassy" | "playful" | "retro" | "scifi"

/**
 * One voice a preset adds on top of each semantic note.
 *
 * The first layer is the note itself. Everything after it is colour: an
 * interval, a detune, or a longer tail. Layer gains are normalised at resolve
 * time so a three-layer preset is not three times louder than a one-layer one.
 */
export type PresetLayer = {
  /** Semitones from the semantic note. 0 is unison, 12 an octave up. */
  interval: number
  /**
   * Cents off, for beating. Two voices a few cents apart drift in and out of
   * phase, which is the whole of what "warm" means on a synthesizer.
   */
  detuneCents?: number
  waveform: Waveform
  /** Relative level within the stack, before normalisation. */
  gain: number
  /** Multiplier on decay and release. Above 1 makes this layer ring on. */
  tail?: number
}

export type PresetDef = {
  id: PresetId
  name: string
  /** One line, shown in the dropdown. Say what it sounds like, not what it is. */
  blurb: string
  /** Where it belongs. Shown beside the blurb. */
  suits: string
  baseHz: number
  /** The stack every semantic note is expanded into. Never empty. */
  layers: PresetLayer[]
  /** The envelope shape. `envScale` stretches decay and release per tier. */
  attackMs: number
  decayMs: number
  sustain: number
  releaseMs: number
  /**
   * Multiplier on every declared semantic interval. Above 1 exaggerates the
   * rises and falls; below 1 flattens them. Never negative — a preset may not
   * reverse a sound's direction, because direction is meaning.
   */
  sweepScale: number
  /**
   * The downward glide given to a note that declares no interval of its own,
   * in semitones. This is what gives an otherwise steady note its character.
   */
  intrinsicSweep: number
  /** Share of decay + release that the pitch glide occupies, 0–1. */
  sweepShare: number
  /**
   * How the pitch travels. `stepped` moves in discrete jumps instead of
   * sliding — chiptune hardware had no portamento, and imitating that
   * limitation is most of what makes a retro sound read as retro.
   */
  glide: "smooth" | "stepped"
  filterType: "lowpass" | "highpass"
  filterCutoffHz: number
  filterQ: number
  /** Null on presets with no noise layer. */
  noise: { amount: number; decayMs: number } | null
  /** Peak amplitude per tier, before loudness normalization. */
  gain: Record<Tier, number>
  /**
   * How much the tier stretches decay and release. Attack is left alone — it
   * is character, and stretching it would just make an alert mushy.
   *
   * Every preset is written so `notable` is 1.0 — the tier's decay and release
   * ARE the preset's, and subtle and alert scale around it. That makes the
   * numbers above readable as the sound's real shape rather than as a base
   * nobody hears.
   *
   * The ceiling is set by the two-note sounds: `notification` starts its second
   * note 40% in, so its total runs about 1.4x the envelope — more where a layer
   * has a `tail`. See DURATION_BUDGET.
   */
  envScale: Record<Tier, number>
}

/** A single unison voice — the stack for presets that want no colour. */
const solo = (waveform: Waveform): PresetLayer[] => [{ interval: 0, waveform, gain: 1 }]

export const PRESETS: Record<PresetId, PresetDef> = {
  soft: {
    id: "soft",
    name: "Soft",
    blurb: "Rounded, low, unhurried. Nothing sharp, so it survives being heard all day.",
    suits: "the safe default",
    // 720 Hz rather than 880: warmer, and still high enough that `delete`'s
    // octave drop lands near 360 Hz instead of inside the small-speaker
    // rolloff.
    baseHz: 720,
    layers: solo("sine"),
    attackMs: 8,
    decayMs: 150,
    sustain: 0,
    releaseMs: 75,
    sweepScale: 0.8,
    intrinsicSweep: 1.5,
    sweepShare: 0.3,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 1400,
    filterQ: 0.7,
    noise: null,
    gain: { subtle: 0.18, notable: 0.3, alert: 0.4 },
    envScale: { subtle: 0.46, notable: 1.0, alert: 1.65 },
  },

  minimal: {
    id: "minimal",
    name: "Minimal",
    blurb: "You notice it missing, not present. About a third of Soft's loudness.",
    suits: "tools people live in all day",
    // 900, not the round 1000: at 1000 the top note of `notification` lands at
    // 2119 Hz, over the harsh-band line.
    baseHz: 900,
    layers: solo("triangle"),
    attackMs: 2,
    decayMs: 106,
    sustain: 0,
    releaseMs: 42,
    // 0.7, not 0.5. Restraint here is a matter of level — a tenth of Soft's
    // gain — not of holding still, and at 0.5 every contour compressed far
    // enough that `close` and `tap` became the same falling sound.
    sweepScale: 0.7,
    intrinsicSweep: 1,
    sweepShare: 0.22,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 2200,
    filterQ: 0.5,
    noise: null,
    gain: { subtle: 0.08, notable: 0.13, alert: 0.18 },
    envScale: { subtle: 0.5, notable: 1.0, alert: 1.6 },
  },

  crisp: {
    id: "crisp",
    name: "Crisp",
    blurb: "A click, not a beep. A 1 ms attack, a noise transient, and almost no tail.",
    suits: "dense, fast interfaces",
    baseHz: 880,
    layers: solo("square"),
    attackMs: 1,
    decayMs: 84,
    sustain: 0,
    releaseMs: 15,
    sweepScale: 1.3,
    // 2, not 3. `notification`'s top note sits at +12, and an intrinsic glide
    // of 3 starts it at 880 x 2^(15/12) = 2093 Hz — inside the harsh band.
    intrinsicSweep: 2,
    sweepShare: 0.14,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 5000,
    filterQ: 1.2,
    // 6 ms, so it does most of its work before the oscillator reaches full
    // amplitude. That ordering is what reads as a physical click.
    noise: { amount: 0.25, decayMs: 6 },
    gain: { subtle: 0.22, notable: 0.35, alert: 0.45 },
    envScale: { subtle: 0.74, notable: 1.0, alert: 1.68 },
  },

  warm: {
    id: "warm",
    name: "Warm",
    blurb: "Three sines a few cents apart, beating audibly against each other. Dark and full.",
    suits: "finance, health, anything that should feel steady",
    baseHz: 680,
    // Three sines, spread 24 cents from lowest to highest. Beating is what
    // "warm" means on a synthesizer, but the rate has to fit the sound: a
    // single twin 9 cents out beat at 3.5 Hz, one cycle every 285 ms, so at a
    // 132 ms `tap` you heard less than half a cycle — no beating at all, just a
    // fractionally thicker tone. Twelve cents either side beats near 9.4 Hz,
    // which is nearly three cycles inside a 290 ms sound and audible as
    // movement.
    //
    // No octave layer. Warmth is darkness, and shine works against it — the
    // body comes from the three unisons under a low cutoff instead.
    layers: [
      { interval: 0, waveform: "sine", gain: 1 },
      { interval: 0, detuneCents: 12, waveform: "sine", gain: 0.9 },
      { interval: 0, detuneCents: -12, waveform: "sine", gain: 0.9 },
    ],
    attackMs: 14,
    decayMs: 174,
    sustain: 0,
    releaseMs: 102,
    sweepScale: 0.65,
    intrinsicSweep: 1.2,
    sweepShare: 0.34,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 820,
    filterQ: 0.5,
    noise: null,
    gain: { subtle: 0.2, notable: 0.32, alert: 0.42 },
    envScale: { subtle: 0.42, notable: 1.0, alert: 1.5 },
  },

  bloopy: {
    id: "bloopy",
    name: "Bloopy",
    blurb: "Round, wet and unhurried — a drop into water. Deep glide, almost no edge.",
    suits: "therapy, meditation, anything that should slow you down",
    baseHz: 700,
    layers: [
      { interval: 0, waveform: "sine", gain: 1 },
      { interval: 12, waveform: "sine", gain: 0.18, tail: 0.7 },
    ],
    attackMs: 8,
    decayMs: 193,
    sustain: 0,
    releaseMs: 129,
    // A deep, slow glide on a sine through a low resonant filter is the whole
    // "bloop". The resonance does real work here — at Q 0.7 this is just a soft
    // tone; at 3.5 the filter rings enough to give the drop a body.
    sweepScale: 1.4,
    intrinsicSweep: 4,
    sweepShare: 0.42,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 720,
    filterQ: 3.5,
    noise: null,
    gain: { subtle: 0.2, notable: 0.3, alert: 0.38 },
    envScale: { subtle: 0.38, notable: 1.0, alert: 1.35 },
  },

  glassy: {
    id: "glassy",
    name: "Glassy",
    blurb: "Struck and clear. A bright octave-and-a-twelfth shimmer that fades before the note does.",
    suits: "premium, editorial, anything unhurried",
    baseHz: 760,
    // The partials are SHORTER than the note, not longer, and that inversion is
    // the whole difference between glass and metal.
    //
    // They used to be longer — 1.5 and 1.9, raised deliberately so this would
    // "ring properly as a bell". It worked, and that was the bug: a bell IS
    // metal. Measured, those settings doubled the sound's spectral centroid
    // between its opening quarter and its closing third (988 Hz -> 2137 Hz on
    // `tap`, against 761 -> 834 for Soft), because the fundamental died first
    // and left the upper partials sounding alone. A sound that gets BRIGHTER as
    // it decays is a struck bell, every time.
    //
    // Struck glass does the reverse: a bright onset whose high partials fade
    // faster than the note beneath them. So the shimmer is louder and brief,
    // and what is left ringing is the note itself — which is also the "clarity"
    // that was missing, since the thing carrying the sound's identity was the
    // first thing to disappear.
    //
    // The waveforms are all sines and the filter is flat, which help but only
    // barely: measured, swapping the two triangles out and dropping Q from 2.5
    // moved the centroid 1041 Hz -> 983 Hz, about 6%. Triangle harmonics fall
    // off as 1/n-squared and the lowpass had already removed most of what was
    // left. Worth keeping, not worth mistaking for the fix.
    layers: [
      { interval: 0, waveform: "sine", gain: 1 },
      { interval: 12, waveform: "sine", gain: 0.42, tail: 0.55 },
      // The twelfth is quiet on purpose. An octave reinforces the note under
      // it; a twelfth is a fifth, a NEW pitch class, and at any strength it
      // reads as tin rather than as glass. It is here for the sparkle in the
      // first few milliseconds, not to be heard as a note of its own.
      { interval: 19, waveform: "sine", gain: 0.1, tail: 0.4 },
    ],
    // 6 ms, not 3. Fast enough to still read as struck, slow enough to lose the
    // edge on the transient — "not so sharp" is largely the onset, not the
    // spectrum.
    attackMs: 6,
    // Longer than they were, because the ring that used to carry this preset's
    // length is gone: the partials now fade BEFORE the note instead of after
    // it, which took `toggle.on` down to 68 ms — under the floor where the ear
    // stops integrating. The length has to come from the note itself now.
    decayMs: 116,
    sustain: 0,
    releaseMs: 88,
    // At 0.45 every contour in the set compressed
    // almost to flat and shape stopped telling sounds apart here at all — the
    // character is carried by the partial stack now, so this does not have to
    // hold still to earn it.
    sweepScale: 0.7,
    intrinsicSweep: 0.8,
    sweepShare: 0.16,
    glide: "smooth",
    filterType: "lowpass",
    // Open, and flat. A Q of 2.5 built a resonant bump around the cutoff, and a
    // resonant peak on top of dense partials is the other half of why this read
    // as metal. Nothing here should be emphasised over anything else — the
    // partials are the character, so the filter's job is to stay out of the way.
    // 3200, down from 5200. The stack is three sines with nothing above the
    // twelfth, so a cutoff up at 5.2 kHz was not removing anything — it was
    // just letting the partials through unrounded. Bringing it down to sit
    // between the twelfth and the top of the range takes the edge off them
    // without touching the note.
    filterCutoffHz: 3200,
    filterQ: 0.7,
    noise: null,
    gain: { subtle: 0.16, notable: 0.26, alert: 0.34 },
    envScale: { subtle: 0.42, notable: 1.0, alert: 1.35 },
  },

  playful: {
    id: "playful",
    name: "Playful",
    blurb: "Bouncy and bright, with exaggerated leaps. A square edge over a soft core.",
    suits: "games, kids' apps, anything that rewards you",
    baseHz: 800,
    layers: [
      { interval: 0, waveform: "triangle", gain: 1 },
      { interval: 12, waveform: "square", gain: 0.22 },
    ],
    attackMs: 2,
    decayMs: 134,
    sustain: 0,
    releaseMs: 34,
    // The leaps are the joke. Everything the set says rises or falls, this says
    // twice as hard — without ever reversing a direction, because direction is
    // meaning even when the tone is silly.
    sweepScale: 1.4,
    intrinsicSweep: 3,
    sweepShare: 0.2,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 3200,
    filterQ: 1.5,
    noise: null,
    gain: { subtle: 0.22, notable: 0.34, alert: 0.44 },
    envScale: { subtle: 0.45, notable: 1.0, alert: 1.6 },
  },

  retro: {
    id: "retro",
    name: "Retro",
    blurb: "Chiptune. Square waves, an octave stacked on top, and pitch that jumps in steps.",
    suits: "games, dev tools, anything with a sense of humour",
    baseHz: 880,
    layers: [
      { interval: 0, waveform: "square", gain: 1 },
      { interval: 12, waveform: "square", gain: 0.32 },
    ],
    attackMs: 1,
    decayMs: 95,
    sustain: 0,
    releaseMs: 14,
    sweepScale: 1.4,
    intrinsicSweep: 2,
    sweepShare: 0.16,
    // The one preset that does not slide. Chiptune hardware had no portamento —
    // pitch was written to a register, so it jumped — and imitating that
    // limitation is most of what makes this read as retro rather than as a
    // square wave with a swoop.
    glide: "stepped",
    filterType: "lowpass",
    filterCutoffHz: 6000,
    filterQ: 0.5,
    noise: { amount: 0.15, decayMs: 12 },
    gain: { subtle: 0.2, notable: 0.3, alert: 0.4 },
    envScale: { subtle: 0.66, notable: 1.0, alert: 1.7 },
  },

  scifi: {
    id: "scifi",
    name: "Sci-Fi",
    blurb: "Zaps. Sawtooth stacked in fifths, plunging through a resonant filter.",
    suits: "games, dashboards, anything that wants to feel like a console",
    baseHz: 820,
    layers: [
      { interval: 0, waveform: "sawtooth", gain: 1 },
      { interval: 7, waveform: "sawtooth", gain: 0.4 },
    ],
    attackMs: 1,
    decayMs: 157,
    sustain: 0,
    releaseMs: 32,
    // Three times the declared interval, travelled fast. A `delete` that
    // normally falls an octave here starts two octaves up and plunges. The
    // sweep passes THROUGH the harsh band rather than sitting in it — which is
    // exactly what a zap is, and why the frequency rule is about where a sound
    // lands, not everywhere it has been.
    sweepScale: 1.4,
    intrinsicSweep: 6,
    sweepShare: 0.1,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 3000,
    // High Q so the filter itself rings as the pitch drops past it. That
    // resonant sweep is what reads as "energy weapon" rather than "buzz".
    filterQ: 8.0,
    noise: { amount: 0.2, decayMs: 10 },
    gain: { subtle: 0.2, notable: 0.32, alert: 0.42 },
    envScale: { subtle: 0.45, notable: 1.0, alert: 1.7 },
  },
}

/** Ordered restrained → expressive, which is how the dropdown reads. */
export const PRESET_IDS: PresetId[] = [
  "soft",
  "minimal",
  "crisp",
  "warm",
  "bloopy",
  "glassy",
  "playful",
  "retro",
  "scifi",
]

export const DEFAULT_PRESET: PresetId = "soft"

export function isPresetId(v: string): v is PresetId {
  return Object.prototype.hasOwnProperty.call(PRESETS, v)
}
