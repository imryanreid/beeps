// ==============================================
// CHARACTER PRESETS
// Soft, Crisp and Minimal, as plain data.
//
// A preset applies to the WHOLE set, not to one
// sound: it sets the base frequency, the waveform,
// the envelope shape, the filter character, the
// noise layer, and the per-tier gain and duration
// budgets. resolve.ts re-derives every event sound
// from those rules, so the set stays internally
// consistent instead of becoming eleven unrelated
// noises.
//
// Nothing here is a code branch, and nothing
// anywhere branches on a preset id. Adding Warm,
// Retro, Glassy or Playful is adding an entry to
// PRESETS and nothing else. If a future preset wants
// a knob this type lacks, add the knob with a
// default — don't special-case the preset.
//
// These numbers are a considered starting point.
// Presets are the highest-taste, lowest-code part of
// this product and they get finished by ear.
// ==============================================
import type { Tier, Waveform } from "./sounds.js"

export type PresetId = "soft" | "crisp" | "minimal"

export type PresetDef = {
  id: PresetId
  name: string
  /** One line, shown under the preset name. */
  blurb: string
  baseHz: number
  waveform: Waveform
  /** The envelope shape. Per-tier durations scale the sustain segment, not these. */
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
   * The downward glide given to a voice that declares no interval of its own
   * (`from === to`), in semitones. This is what gives an otherwise steady note
   * its character.
   */
  intrinsicSweep: number
  /** Share of the sound's duration the pitch sweep occupies, 0–1. */
  sweepShare: number
  filterType: "lowpass" | "highpass"
  filterCutoffHz: number
  filterQ: number
  /** Null on presets with no noise layer. */
  noise: { amount: number; decayMs: number } | null
  /** Peak amplitude per tier, before loudness normalization. */
  gain: Record<Tier, number>
  /** Duration budget per tier, in ms. */
  duration: Record<Tier, number>
}

export const PRESETS: Record<PresetId, PresetDef> = {
  soft: {
    id: "soft",
    name: "Soft",
    blurb: "Rounded, low, unhurried. Nothing sharp, so it survives being heard all day.",
    // 720 Hz rather than 880: warmer, and still high enough that `delete`'s
    // octave drop lands near 360 Hz instead of inside the phone-speaker
    // rolloff. This is the lowest base any shipped preset uses.
    baseHz: 720,
    waveform: "sine",
    attackMs: 8,
    decayMs: 90,
    sustain: 0,
    releaseMs: 40,
    sweepScale: 0.8,
    intrinsicSweep: 1.5,
    sweepShare: 0.55,
    filterType: "lowpass",
    filterCutoffHz: 1400,
    filterQ: 0.7,
    noise: null,
    gain: { subtle: 0.18, notable: 0.3, alert: 0.4 },
    duration: { subtle: 90, notable: 150, alert: 210 },
  },

  crisp: {
    id: "crisp",
    name: "Crisp",
    blurb: "A click, not a beep. A 1 ms attack and a noise transient that lands first.",
    baseHz: 880,
    waveform: "square",
    attackMs: 1,
    decayMs: 35,
    sustain: 0,
    releaseMs: 15,
    sweepScale: 1.3,
    // 2, not 3. `notification`'s top note sits at +12, and an intrinsic glide
    // of 3 starts it at 880 x 2^(15/12) = 2093 Hz — inside the 2-5 kHz harsh
    // band. Crisp's identity is the 1 ms attack, the noise transient and the
    // steep scaling of declared intervals, none of which this touches.
    intrinsicSweep: 2,
    sweepShare: 0.35,
    filterType: "lowpass",
    filterCutoffHz: 5000,
    filterQ: 1.2,
    // 6 ms, so it does most of its work before the oscillator reaches full
    // amplitude. That ordering is what reads as a physical click rather than
    // as a short tone with a hiss on top.
    noise: { amount: 0.25, decayMs: 6 },
    gain: { subtle: 0.22, notable: 0.35, alert: 0.45 },
    duration: { subtle: 55, notable: 110, alert: 170 },
  },

  minimal: {
    id: "minimal",
    name: "Minimal",
    blurb: "You notice it missing, not present. About a third of Soft's loudness.",
    // 900, not the round 1000. At 1000 the top note of `notification` lands at
    // 1000 x 2^(13/12) = 2119 Hz, over the harsh-band line — the same trap
    // SPEC 7.1.1 identifies for a base of 1046. The ceiling is set by the
    // highest note plus the intrinsic glide, not by the base alone.
    baseHz: 900,
    waveform: "triangle",
    attackMs: 2,
    decayMs: 24,
    sustain: 0,
    releaseMs: 10,
    sweepScale: 0.5,
    intrinsicSweep: 1,
    sweepShare: 0.4,
    filterType: "lowpass",
    filterCutoffHz: 2200,
    filterQ: 0.5,
    noise: null,
    gain: { subtle: 0.08, notable: 0.13, alert: 0.18 },
    duration: { subtle: 40, notable: 70, alert: 100 },
  },
}

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

export const DEFAULT_PRESET: PresetId = "soft"

export function isPresetId(v: string): v is PresetId {
  return Object.prototype.hasOwnProperty.call(PRESETS, v)
}
