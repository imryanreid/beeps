// ==============================================
// OFFLINE RENDER
// Turning a resolved sound into actual samples, for
// loudness measurement and for the WAV and data-URI
// exports.
//
// The only module in lib/ that needs a browser: it
// drives OfflineAudioContext. Everything it renders
// goes through the SAME scheduleSound the live player
// uses, so a downloaded file cannot disagree with
// the preview — which is the one lie this tool must
// never tell.
// ==============================================
import { scheduleSound } from "../runtime/beeps.js"
import { normalizationGains, spectralCentroidHz, type Rendered } from "./loudness.js"
import { applyNormalization, soundingMs } from "./resolve.js"
import type { Sound, SoundId, SoundSet } from "./sounds.js"
import { DEFAULT_WAV, encodeWav, toDataUri, type WavOptions } from "./wav.js"

/** A little air after the tail, so nothing is truncated mid-release. */
const PAD_MS = 20

type OfflineCtor = new (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext

function offlineCtor(): OfflineCtor | null {
  const g = globalThis as unknown as {
    OfflineAudioContext?: OfflineCtor
    webkitOfflineAudioContext?: OfflineCtor
  }
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null
}

/** True when this environment can render at all. False in Node, and in tests. */
export const canRender = (): boolean => offlineCtor() !== null

/**
 * Render one sound to mono samples.
 *
 * `normalizedGain` is whatever the sound currently carries, so calling this on
 * an unnormalized set measures the raw output — which is exactly what
 * `measureSet` needs before it can decide on gains.
 */
export async function renderSound(
  sound: Sound,
  opts: WavOptions = DEFAULT_WAV,
): Promise<Float32Array> {
  const Ctor = offlineCtor()
  if (!Ctor) throw new Error("OfflineAudioContext unavailable")

  const seconds = (soundingMs(sound) + PAD_MS) / 1000
  const ctx = new Ctor(opts.channels, Math.ceil(seconds * opts.sampleRate), opts.sampleRate)
  scheduleSound(ctx, ctx.destination, sound, 0)
  const buffer = await ctx.startRendering()
  return buffer.getChannelData(0)
}

/**
 * Render every sound, measure it, and return the set with gains folded in.
 *
 * Rendering happens at the *unnormalized* level and the gain is applied to the
 * set afterwards rather than re-rendering — the measurement is linear in gain,
 * so a second pass would cost eleven more renders to learn nothing.
 */
export async function normalizeSet(
  set: SoundSet,
  opts: WavOptions = DEFAULT_WAV,
): Promise<SoundSet> {
  if (!canRender()) return set

  const rendered: Partial<Record<SoundId, Rendered>> = {}
  for (const sound of set.sounds) {
    try {
      rendered[sound.id] = {
        samples: await renderSound(sound, opts),
        centroidHz: spectralCentroidHz(sound),
      }
    } catch {
      // A sound that will not render is left at unity rather than taking the
      // whole set down with it. Better one wrong level than no tool.
    }
  }

  return applyNormalization(set, normalizationGains(set.sounds, rendered))
}

export type EncodedSound = {
  bytes: Uint8Array
  dataUri: string
  frames: number
  peak: number
  durationMs: number
}

/** One sound as a finished .wav, plus the numbers the export panel reports. */
export async function encodeSound(
  sound: Sound,
  opts: WavOptions = DEFAULT_WAV,
): Promise<EncodedSound> {
  const samples = await renderSound(sound, opts)
  let max = 0
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i])
    if (v > max) max = v
  }
  const bytes = encodeWav(samples, opts)
  return {
    bytes,
    dataUri: toDataUri(bytes),
    frames: samples.length,
    peak: max,
    durationMs: (samples.length / opts.sampleRate) * 1000,
  }
}
