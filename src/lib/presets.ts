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
    decayMs: 155,
    sustain: 0,
    releaseMs: 67,
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
    decayMs: 115,
    sustain: 0,
    releaseMs: 48,
    sweepScale: 0.5,
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
    blurb: "A click, not a beep. A 1 ms attack and a noise transient that lands first.",
    suits: "dense, fast interfaces",
    baseHz: 880,
    layers: solo("square"),
    attackMs: 1,
    decayMs: 125,
    sustain: 0,
    releaseMs: 44,
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
    envScale: { subtle: 0.47, notable: 1.0, alert: 1.6 },
  },

  warm: {
    id: "warm",
    name: "Warm",
    blurb: "Two voices a few cents apart, beating slowly against each other. Dark and full.",
    suits: "finance, health, anything that should feel steady",
    baseHz: 680,
    // The entire character is here: a twin detuned by 9 cents drifts in and
    // out of phase with the first, and that slow beating is what "warm" means
    // on a synthesizer. One sine alone cannot do it at any filter setting.
    layers: [
      { interval: 0, waveform: "sine", gain: 1 },
      { interval: 0, detuneCents: 9, waveform: "sine", gain: 0.85 },
      { interval: 12, waveform: "sine", gain: 0.12 },
    ],
    attackMs: 12,
    decayMs: 190,
    sustain: 0,
    releaseMs: 78,
    sweepScale: 0.65,
    intrinsicSweep: 1.2,
    sweepShare: 0.34,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 900,
    filterQ: 0.6,
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
    attackMs: 6,
    decayMs: 225,
    sustain: 0,
    releaseMs: 89,
    // A deep, slow glide on a sine through a low resonant filter is the whole
    // "bloop". The resonance does real work here — at Q 0.7 this is just a soft
    // tone; at 3.5 the filter rings enough to give the drop a body.
    sweepScale: 1.8,
    intrinsicSweep: 4,
    sweepShare: 0.42,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 720,
    filterQ: 3.5,
    noise: null,
    gain: { subtle: 0.2, notable: 0.3, alert: 0.38 },
    envScale: { subtle: 0.4, notable: 1.0, alert: 1.45 },
  },

  glassy: {
    id: "glassy",
    name: "Glassy",
    blurb: "Bell-like. An octave and a twelfth ring on above the note, long after it stops.",
    suits: "premium, editorial, anything unhurried",
    baseHz: 760,
    // Bells are their overtones. The upper partials outlast the fundamental,
    // which is what `tail` above 1 buys — they are still sounding when the note
    // underneath has gone.
    layers: [
      { interval: 0, waveform: "triangle", gain: 1 },
      { interval: 12, waveform: "triangle", gain: 0.3, tail: 1.35 },
      { interval: 19, waveform: "sine", gain: 0.12, tail: 1.55 },
    ],
    attackMs: 3,
    decayMs: 140,
    sustain: 0,
    releaseMs: 72,
    // Bells do not swoop. Almost all the character is in the overtones.
    sweepScale: 0.45,
    intrinsicSweep: 0.8,
    sweepShare: 0.16,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 4500,
    filterQ: 2.5,
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
    decayMs: 150,
    sustain: 0,
    releaseMs: 58,
    // The leaps are the joke. Everything the set says rises or falls, this says
    // twice as hard — without ever reversing a direction, because direction is
    // meaning even when the tone is silly.
    sweepScale: 1.7,
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
    decayMs: 135,
    sustain: 0,
    releaseMs: 44,
    sweepScale: 1.5,
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
    envScale: { subtle: 0.45, notable: 1.0, alert: 1.7 },
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
    decayMs: 150,
    sustain: 0,
    releaseMs: 49,
    // Three times the declared interval, travelled fast. A `delete` that
    // normally falls an octave here starts two octaves up and plunges. The
    // sweep passes THROUGH the harsh band rather than sitting in it — which is
    // exactly what a zap is, and why the frequency rule is about where a sound
    // lands, not everywhere it has been.
    sweepScale: 3,
    intrinsicSweep: 6,
    sweepShare: 0.1,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 3000,
    // High Q so the filter itself rings as the pitch drops past it. That
    // resonant sweep is what reads as "energy weapon" rather than "buzz".
    filterQ: 8,
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
