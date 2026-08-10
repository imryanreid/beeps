// ==============================================
// WAV ENCODER
// Float samples in, a complete .wav file out.
//
// About fifty lines and no dependency, which is the
// entire reason this tool exports WAV rather than
// anything compressed. A 44-byte RIFF header and
// interleaved PCM is the whole format.
//
// Takes channels, sample rate and bit depth as
// parameters even though v1 only ever calls it as
// mono / 44100 / 16. A future sample-rate option
// halves the data-URI size, and hardcoding the three
// numbers is exactly what would make that change
// invasive instead of a one-line select.
// ==============================================

export type WavOptions = {
  sampleRate: number
  /** 1 = mono. UI sound should stay mono; a panned notification is a bug. */
  channels: number
  /** 16 today. The writer handles 8 and 32 too. */
  bitDepth: 8 | 16 | 32
}

export const DEFAULT_WAV: WavOptions = { sampleRate: 44100, channels: 1, bitDepth: 16 }

/** Byte length of the finished file, without building it. */
export function wavByteLength(frames: number, opts: WavOptions = DEFAULT_WAV): number {
  return 44 + frames * opts.channels * (opts.bitDepth / 8)
}

/**
 * Encode interleaved float samples (nominally −1…1) as a RIFF/WAVE file.
 *
 * Samples outside the range are clamped rather than allowed to wrap. A float
 * of 1.5 written as a 16-bit integer without clamping wraps to a large
 * negative — so a moment of clipping becomes a full-scale discontinuity, which
 * is a loud crack rather than the soft distortion anyone would expect.
 */
export function encodeWav(samples: Float32Array, opts: WavOptions = DEFAULT_WAV): Uint8Array {
  const { sampleRate, channels, bitDepth } = opts
  const bytesPerSample = bitDepth / 8
  const dataBytes = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  // RIFF header
  writeAscii(0, "RIFF")
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(8, "WAVE")

  // fmt chunk
  writeAscii(12, "fmt ")
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true) // 3 = IEEE float, 1 = PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * bytesPerSample, true) // byte rate
  view.setUint16(32, channels * bytesPerSample, true) // block align
  view.setUint16(34, bitDepth, true)

  // data chunk
  writeAscii(36, "data")
  view.setUint32(40, dataBytes, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    if (bitDepth === 16) {
      // Asymmetric on purpose: two's complement runs −32768…32767, so scaling
      // negatives by 32768 and positives by 32767 uses the full range without
      // letting −1.0 wrap to +32767.
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    } else if (bitDepth === 8) {
      // 8-bit WAV is unsigned, centred on 128. Every other depth is signed.
      view.setUint8(offset, Math.round((s + 1) * 127.5))
    } else {
      view.setFloat32(offset, s, true)
    }
    offset += bytesPerSample
  }

  return new Uint8Array(buffer)
}

/**
 * The same bytes as a `data:` URI, for inlining with no network request.
 *
 * Base64 costs a third on top: a 150 ms mono sound is 13,230 bytes of WAV and
 * about 17.6 KB once encoded. The panel quotes the encoded figure, since size
 * is the reason anyone picks this format.
 */
export function toDataUri(bytes: Uint8Array): string {
  let binary = ""
  // Chunked: String.fromCharCode(...bytes) on a 100 KB array overflows the
  // argument limit and throws, and the failure looks like a corrupt export
  // rather than a stack problem.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  const b64 =
    typeof btoa === "function" ? btoa(binary) : Buffer.from(binary, "binary").toString("base64")
  return `data:audio/wav;base64,${b64}`
}
