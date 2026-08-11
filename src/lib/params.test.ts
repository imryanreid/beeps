// ==============================================
// PARAMS, WAV AND LOUDNESS TESTS
// The three pure modules that have exact right
// answers: a URL that round-trips, a RIFF header
// that matches the spec byte for byte, and an
// A-weighting curve with published reference values
// to check against.
// ==============================================
import { describe, expect, it } from "vitest"
import {
  decodeConfig,
  decodeWarnings,
  encodeConfig,
  idToKey,
  isDefaultConfig,
  keyToId,
  resolveConfig,
} from "./params.js"
import { DEFAULT_CONFIG, applyEdit, resolve, type SetConfig } from "./resolve.js"
import { DEFAULT_WAV, encodeWav, toDataUri, wavByteLength } from "./wav.js"
import { aWeightDb, normalizationGains, peak, perceivedLevelDb, rms } from "./loudness.js"
import { SOUND_IDS, pairDropSemitones } from "./sounds.js"

// ---------------------------------------------------------------------------

describe("url params", () => {
  it("writes nothing for an untouched default", () => {
    expect(encodeConfig(DEFAULT_CONFIG)).toBe("")
    expect(isDefaultConfig(DEFAULT_CONFIG)).toBe(true)
  })

  it("round-trips a preset change", () => {
    const config: SetConfig = { presetId: "crisp", deltas: {} }
    expect(encodeConfig(config)).toBe("p=crisp")
    expect(resolveConfig(encodeConfig(config)).presetId).toBe("crisp")
  })

  it("round-trips deltas exactly", () => {
    const config: SetConfig = {
      presetId: "crisp",
      baseHz: 700,
      deltas: {
        tap: { startHz: 900, attackMs: 2 },
        error: { gainTrimDb: -3, q: 1.4 },
      },
    }
    const round = resolveConfig(encodeConfig(config))
    expect(round.presetId).toBe("crisp")
    expect(round.baseHz).toBe(700)
    expect(round.deltas.tap).toEqual({ startHz: 900, attackMs: 2 })
    expect(round.deltas.error).toEqual({ gainTrimDb: -3, q: 1.4 })
  })

  it("stays short — a whole edited set fits in a few hundred characters", () => {
    let config: SetConfig = { presetId: "crisp", baseHz: 760, deltas: {} }
    for (const id of SOUND_IDS) {
      config = applyEdit(config, id, {
        startHz: 900,
        endHz: 600,
        attackMs: 3,
        sweepMs: 40,
        gainTrimDb: -2,
      })
    }
    const encoded = encodeConfig(config)
    expect(encoded.length).toBeLessThan(400)
    // And it is still readable, which is the entire reason for skipping base64.
    expect(encoded).toContain("p=crisp")
    expect(encoded).toContain("f900")
  })

  it("maps the dotted ids to hyphenated keys and back", () => {
    expect(idToKey("toggle.on")).toBe("toggle-on")
    expect(keyToId("toggle-on")).toBe("toggle.on")
    expect(keyToId("nope")).toBeUndefined()
  })

  it("keeps dots unencoded so the link stays readable", () => {
    const encoded = encodeConfig({
      presetId: "soft",
      deltas: { tap: { startHz: 800, attackMs: 4 } },
    })
    expect(encoded).toContain("f800.a4")
    expect(encoded).not.toContain("%2E")
  })

  it("survives a hand-edited link rather than erroring", () => {
    expect(() => resolveConfig("p=nonsense&tap=zzz&bogus=1&b=abc")).not.toThrow()
    const config = resolveConfig("p=nonsense&tap=zzz&bogus=1&b=abc")
    expect(config.presetId).toBe(DEFAULT_CONFIG.presetId)
    expect(config.deltas).toEqual({})
    expect(() => resolve(config)).not.toThrow()
  })

  it("drops one bad field without losing the good ones beside it", () => {
    const config = resolveConfig("tap=f900.zz99.a3")
    expect(config.deltas.tap).toEqual({ startHz: 900, attackMs: 3 })
  })

  it("clamps a base frequency out of range", () => {
    expect(resolveConfig("b=99999").baseHz).toBe(2000)
    expect(resolveConfig("b=1").baseHz).toBe(220)
  })

  it("reports what a mangled link lost", () => {
    expect(decodeWarnings("")).toEqual([])
    expect(decodeWarnings("p=crisp&tap=f900")).toEqual([])

    const bad = decodeWarnings("p=purple&nosuchsound=f900")
    expect(bad).toHaveLength(2)
    expect(bad[0]).toContain("purple")
    expect(bad[1]).toContain("nosuchsound")
  })

  it("does not echo something unprintable back into a warning", () => {
    const warnings = decodeWarnings(`${encodeURIComponent("</script><b>")}=f900`)
    expect(warnings[0]).not.toContain("<script")
    expect(warnings[0]).not.toContain("<b>")
    expect(warnings[0]).toContain("1 parameter")
  })

  it("round-trips a paired edit through the URL", () => {
    const config = applyEdit(DEFAULT_CONFIG, "close", { startHz: 900, endHz: 500 })
    const set = resolve(resolveConfig(encodeConfig(config)))
    const open = set.sounds.find((s) => s.id === "open")!.voices[0]
    const close = set.sounds.find((s) => s.id === "close")!.voices[0]
    if (open.kind !== "osc" || close.kind !== "osc") throw new Error("expected osc")
    // The URL rounds to whole hertz, so the derived side lands within one.
    expect(close.pitch.startHz).toBeCloseTo(900, 0)
    // open sits a pair-drop above, which the codec preserves through the lift.
    expect(open.pitch.endHz / close.pitch.startHz).toBeCloseTo(
      Math.pow(2, pairDropSemitones("close") / 12),
      2,
    )
  })

  it("does not write a delta the resolver would overwrite", () => {
    // close is the derived side, so its pitch belongs on open.
    const config = applyEdit(DEFAULT_CONFIG, "close", { startHz: 900 })
    const encoded = encodeConfig(config)
    expect(encoded).toContain("open=")
    expect(encoded).not.toContain("close=")
  })
})

// ---------------------------------------------------------------------------

describe("wav encoder", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1])

  it("writes a RIFF/WAVE header the spec would recognise", () => {
    const bytes = encodeWav(samples)
    const text = (from: number, len: number) =>
      String.fromCharCode(...bytes.subarray(from, from + len))
    expect(text(0, 4)).toBe("RIFF")
    expect(text(8, 4)).toBe("WAVE")
    expect(text(12, 4)).toBe("fmt ")
    expect(text(36, 4)).toBe("data")

    const view = new DataView(bytes.buffer)
    expect(view.getUint32(4, true)).toBe(bytes.length - 8) // RIFF size
    expect(view.getUint32(16, true)).toBe(16) // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint32(28, true)).toBe(44100 * 2) // byte rate
    expect(view.getUint16(32, true)).toBe(2) // block align
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(samples.length * 2) // data size
  })

  it("agrees with wavByteLength", () => {
    expect(encodeWav(samples).length).toBe(wavByteLength(samples.length))
    // The size claim in the README: 150ms mono 16-bit at 44.1kHz.
    expect(wavByteLength(Math.round(0.15 * 44100))).toBe(13274)
  })

  it("clamps rather than wrapping, so clipping is not a crack", () => {
    const hot = encodeWav(new Float32Array([2, -2]))
    const view = new DataView(hot.buffer)
    expect(view.getInt16(44, true)).toBe(0x7fff)
    expect(view.getInt16(46, true)).toBe(-0x8000)
  })

  it("uses the full negative range without wrapping -1.0", () => {
    const view = new DataView(encodeWav(new Float32Array([-1])).buffer)
    expect(view.getInt16(44, true)).toBe(-32768)
  })

  it("honours a different sample rate and depth", () => {
    const bytes = encodeWav(samples, { sampleRate: 22050, channels: 1, bitDepth: 8 })
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(24, true)).toBe(22050)
    expect(view.getUint16(34, true)).toBe(8)
    expect(bytes.length).toBe(44 + samples.length)
    // 8-bit WAV is unsigned and centred on 128.
    expect(view.getUint8(44)).toBe(128)
  })

  it("makes a data URI, and the base64 costs a third", () => {
    const bytes = encodeWav(new Float32Array(Math.round(0.15 * 44100)))
    const uri = toDataUri(bytes)
    expect(uri.startsWith("data:audio/wav;base64,")).toBe(true)
    const encodedBytes = uri.length - "data:audio/wav;base64,".length
    expect(encodedBytes / bytes.length).toBeCloseTo(4 / 3, 1)
  })

  it("does not blow the argument limit on a long sound", () => {
    // String.fromCharCode(...bytes) throws somewhere around 100k arguments.
    const long = encodeWav(new Float32Array(300000))
    expect(() => toDataUri(long)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------

describe("loudness", () => {
  it("matches the published A-weighting curve", () => {
    // 0 dB at 1 kHz is exact by definition — that is what the +2.00 term is
    // for, and it is the one value worth asserting tightly.
    expect(aWeightDb(1000)).toBeCloseTo(0, 2)

    // The rest are IEC 61672 table values, which are published rounded to one
    // decimal and tabulated at nominal third-octave centres rather than at the
    // round numbers below. 0.1 dB is the honest tolerance against them; a
    // tighter one would be asserting agreement the sources do not claim.
    const reference: [number, number][] = [
      [100, -19.1],
      [200, -10.9],
      [500, -3.2],
      [2000, 1.2],
      [10000, -2.5],
    ]
    for (const [hz, expected] of reference) {
      expect(Math.abs(aWeightDb(hz) - expected), `${hz}Hz`).toBeLessThan(0.1)
    }
  })

  it("is monotonic through the band this tool actually uses", () => {
    // 350Hz-2kHz, where every sound in every preset lives. The curve has to
    // rise steadily across it or weighting at a centre frequency — which is
    // what perceivedLevelDb does — would not be a safe approximation.
    let previous = -Infinity
    for (let hz = 350; hz <= 2000; hz += 50) {
      const db = aWeightDb(hz)
      expect(db, `${hz}Hz`).toBeGreaterThan(previous)
      previous = db
    }
  })

  it("penalises the small-speaker floor, which is the point", () => {
    // A 300Hz sound has to be much louder to seem as loud as a 1kHz one.
    expect(aWeightDb(300)).toBeLessThan(aWeightDb(1000) - 5)
  })

  it("measures rms and peak", () => {
    const flat = new Float32Array([0.5, -0.5, 0.5, -0.5])
    expect(rms(flat)).toBeCloseTo(0.5, 6)
    expect(peak(flat)).toBeCloseTo(0.5, 6)
    expect(rms(new Float32Array(0))).toBe(0)
  })

  it("levels a set within its tier, leaving tiers apart", () => {
    const set = resolve(DEFAULT_CONFIG)
    // A loud subtle sound and a quiet one, and one alert sound left alone.
    const loud = new Float32Array(1000).fill(0.5)
    const quiet = new Float32Array(1000).fill(0.05)
    const rendered = {
      tap: { samples: loud, centroidHz: 700 },
      open: { samples: quiet, centroidHz: 700 },
      "toggle.on": { samples: quiet, centroidHz: 700 },
      "toggle.off": { samples: quiet, centroidHz: 700 },
      close: { samples: quiet, centroidHz: 700 },
    }
    const gains = normalizationGains(set.sounds, rendered)

    // tap was the loud outlier, so it comes down toward the tier median.
    expect(gains.tap).toBeLessThan(1)
    // The quiet majority is the median, so it barely moves.
    expect(gains.open).toBeCloseTo(1, 1)
    // A tier with nothing rendered gets no gains rather than a wrong one.
    expect(gains.error).toBeUndefined()
  })

  it("never pushes a sound into clipping", () => {
    const set = resolve(DEFAULT_CONFIG)
    const hot = new Float32Array(500).fill(0.98)
    const rendered = {
      tap: { samples: new Float32Array(500).fill(0.02), centroidHz: 700 },
      open: { samples: hot, centroidHz: 700 },
      "toggle.on": { samples: hot, centroidHz: 700 },
      "toggle.off": { samples: hot, centroidHz: 700 },
      close: { samples: hot, centroidHz: 700 },
    }
    const gains = normalizationGains(set.sounds, rendered)
    for (const [id, gain] of Object.entries(gains)) {
      const r = rendered[id as keyof typeof rendered]
      if (!r) continue
      expect(peak(r.samples) * gain, id).toBeLessThanOrEqual(0.8913 + 1e-6)
    }
  })

  it("weights a low sound as quieter than a mid one at equal rms", () => {
    const buf = new Float32Array(1000).fill(0.3)
    expect(perceivedLevelDb(buf, 300)).toBeLessThan(perceivedLevelDb(buf, 1000))
  })

  it("reports silence as -Infinity rather than NaN", () => {
    expect(perceivedLevelDb(new Float32Array(100), 700)).toBe(-Infinity)
  })
})
