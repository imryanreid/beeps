// ==============================================
// LOUDNESS
// Measuring how loud a sound actually seems, so
// nothing in the set spikes relative to its siblings.
//
// Why not LUFS: ITU-R BS.1770 is the obvious choice
// and it is the wrong one here. It gates on 400 ms
// blocks and discards blocks below a relative
// threshold — every sound in this set is shorter than
// a single gating block, so the standard's own
// algorithm has no opinion about them. A-weighted RMS
// over the real duration is simple, defensible, and
// matches perception well enough at these lengths.
//
// Pure functions over Float32Array, so all of this
// tests in Node without an AudioContext anywhere near
// it.
// ==============================================
import type { Sound, SoundId } from "./sounds.js"

/**
 * The A-weighting curve, in dB, at one frequency (IEC 61672).
 *
 * 0 dB at 1 kHz by definition; about −19 dB at 100 Hz and −2.5 dB at 10 kHz.
 * This is what makes a 400 Hz sound and a 1.6 kHz sound at identical amplitude
 * come out at the levels an ear would actually report.
 */
export function aWeightDb(freqHz: number): number {
  if (freqHz <= 0) return -Infinity
  const f2 = freqHz * freqHz
  const c1 = 20.598997 * 20.598997
  const c2 = 107.65265 * 107.65265
  const c3 = 737.86223 * 737.86223
  const c4 = 12194.217 * 12194.217

  const numerator = c4 * f2 * f2
  const denominator = (f2 + c1) * Math.sqrt((f2 + c2) * (f2 + c3)) * (f2 + c4)
  // +2.00 dB normalises the curve to 0 dB at 1 kHz.
  return 20 * Math.log10(numerator / denominator) + 2.0
}

/** Plain root-mean-square of a buffer. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/** Largest absolute sample. Sample peak, not true peak — see `PEAK_CEILING`. */
export function peak(samples: Float32Array): number {
  let max = 0
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i])
    if (v > max) max = v
  }
  return max
}

/**
 * The set's energy-weighted centre frequency, from the voices themselves.
 *
 * Taken from the parameters rather than from a transform of the buffer,
 * because the parameters are exact and an FFT here would be a lot of machinery
 * to rediscover numbers we already hold. A noise voice contributes a broadband
 * centre well above the oscillators, which is the whole reason Crisp reads as
 * brighter than Soft at the same RMS.
 */
export function spectralCentroidHz(sound: Sound): number {
  let weighted = 0
  let total = 0
  for (const v of sound.voices) {
    if (v.kind === "osc") {
      // Midpoint of the sweep, in log space — pitch is logarithmic, so the
      // arithmetic mean of 880 and 440 is not the note in the middle.
      const centre = Math.sqrt(v.pitch.startHz * v.pitch.endHz)
      weighted += centre * v.gain
      total += v.gain
    } else {
      // White noise through the sound's lowpass: treat its centre as roughly
      // half the cutoff, which is where the bulk of the energy sits.
      weighted += sound.filter.cutoffHz * 0.5 * v.gain
      total += v.gain
    }
  }
  return total > 0 ? weighted / total : 0
}

/**
 * Perceived level in dB: RMS, corrected by the A-weighting at the sound's
 * centre frequency.
 *
 * This weights at one frequency rather than filtering the buffer through a
 * full A-weighting network. That is an approximation, and it is a good one
 * *here* specifically: every sound in this set is a handful of sinusoids inside
 * a 350 Hz – 2 kHz window, where the A-curve is smooth, shallow and monotonic.
 * Across that window a per-sample filter and a centre-frequency correction
 * agree to within a fraction of a dB. It would not be good enough for
 * broadband material, and this function should not be reused for any.
 */
export function perceivedLevelDb(samples: Float32Array, centroidHz: number): number {
  const level = rms(samples)
  if (level <= 0) return -Infinity
  return 20 * Math.log10(level) + aWeightDb(centroidHz)
}

/** Nothing may exceed this after normalization. Square waves plus Q can clip. */
export const PEAK_CEILING = Math.pow(10, -1 / 20) // −1 dBFS

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export type Rendered = { samples: Float32Array; centroidHz: number }

/**
 * A gain per sound that levels the set.
 *
 * Sounds are equalized *within* their tier, against that tier's median, so the
 * deliberate loudness gap between subtle, notable and alert survives — the
 * point is that no `tap` is twice as loud as another `tap`, not that everything
 * ends up the same size.
 *
 * Anchoring on the median rather than a fixed target means normalization never
 * raises the whole set: a preset's overall level stays the preset's decision.
 * The peak check can only ever reduce.
 */
export function normalizationGains(
  sounds: Sound[],
  rendered: Partial<Record<SoundId, Rendered>>,
): Record<string, number> {
  const levels = new Map<SoundId, number>()
  for (const s of sounds) {
    const r = rendered[s.id]
    if (!r) continue
    const db = perceivedLevelDb(r.samples, r.centroidHz)
    if (Number.isFinite(db)) levels.set(s.id, db)
  }

  const gains: Record<string, number> = {}
  for (const tier of ["subtle", "notable", "alert"] as const) {
    const inTier = sounds.filter((s) => s.tier === tier && levels.has(s.id))
    if (!inTier.length) continue
    const target = median(inTier.map((s) => levels.get(s.id)!))

    for (const s of inTier) {
      let gain = Math.pow(10, (target - levels.get(s.id)!) / 20)
      // Never let levelling push a sound into clipping.
      const p = rendered[s.id]!.samples
      const peakAfter = peak(p) * gain
      if (peakAfter > PEAK_CEILING) gain *= PEAK_CEILING / peakAfter
      gains[s.id] = gain
    }
  }
  return gains
}
