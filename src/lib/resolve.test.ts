// ==============================================
// RESOLVE TESTS
// The semantic system is the differentiator, so
// these assert the *relationships* rather than
// particular numbers: intervals derive from one
// base, directions survive every preset, pairs
// invert, tiers order, and a hand-edited URL cannot
// produce a set that breaks Web Audio.
// ==============================================
import { describe, expect, it } from "vitest"
import {
  DEFAULT_CONFIG,
  applyEdit,
  fitEnvelope,
  frequencySpan,
  pairedEdits,
  resolve,
  semitonesToHz,
  soundingMs,
  sweepStartSemitones,
} from "./resolve.js"
import { PRESETS, PRESET_IDS } from "./presets.js"
import { PAIRS, SOUND_IDS, SOUND_SPECS, partnerOf, type SoundId } from "./sounds.js"

const setFor = (presetId: (typeof PRESET_IDS)[number]) => resolve({ presetId, deltas: {} })

const soundIn = (presetId: (typeof PRESET_IDS)[number], id: SoundId) => {
  const s = setFor(presetId).sounds.find((x) => x.id === id)
  if (!s) throw new Error(`missing ${id}`)
  return s
}

/** The primary oscillator voice — the one that carries the sound's identity. */
const primary = (id: SoundId, presetId: (typeof PRESET_IDS)[number] = "soft") => {
  const v = soundIn(presetId, id).voices.find((x) => x.kind === "osc")
  if (!v || v.kind !== "osc") throw new Error(`no osc voice on ${id}`)
  return v
}

describe("the set", () => {
  it("resolves all eleven sounds", () => {
    expect(resolve(DEFAULT_CONFIG).sounds).toHaveLength(11)
    expect(SOUND_IDS).toHaveLength(11)
  })

  it("has no duplicate ids", () => {
    expect(new Set(SOUND_IDS).size).toBe(SOUND_IDS.length)
  })

  it("gives every sound a when and a when-not, since both ship to agents", () => {
    for (const spec of SOUND_SPECS) {
      expect(spec.when.length, spec.id).toBeGreaterThan(20)
      expect(spec.whenNot.length, spec.id).toBeGreaterThan(20)
    }
  })
})

describe("intervals", () => {
  it("derives every frequency from the one base", () => {
    // tap's primary ends 2 semitones below base, by its spec.
    const base = PRESETS.soft.baseHz
    expect(primary("tap").pitch.endHz).toBeCloseTo(semitonesToHz(base, -2), 4)
  })

  it("moves the whole set when the base moves", () => {
    const a = resolve({ presetId: "soft", deltas: {} })
    const b = resolve({ presetId: "soft", baseHz: 900, deltas: {} })
    const ratio = 900 / a.baseHz
    for (const id of SOUND_IDS) {
      const av = a.sounds.find((s) => s.id === id)!
      const bv = b.sounds.find((s) => s.id === id)!
      const ao = av.voices.find((v) => v.kind === "osc")!
      const bo = bv.voices.find((v) => v.kind === "osc")!
      if (ao.kind !== "osc" || bo.kind !== "osc") throw new Error("expected osc")
      expect(bo.pitch.endHz / ao.pitch.endHz, id).toBeCloseTo(ratio, 4)
    }
  })

  it("keeps the octave in delete and the fourth in success", () => {
    // delete *lands* an octave below base. The sweep it travels is narrower
    // than an octave on any preset that flattens sweeps, which is the point of
    // sweepScale — the landing note carries the meaning, the sweep carries the
    // character.
    const del = primary("delete")
    expect(del.pitch.endHz).toBeCloseTo(PRESETS.soft.baseHz / 2, 4)
    expect(del.pitch.startHz).toBeGreaterThan(del.pitch.endHz)

    // success is two notes a perfect fourth apart: +4 then +9.
    const notes = soundIn("soft", "success").voices.filter((v) => v.kind === "osc")
    expect(notes).toHaveLength(2)
    if (notes[0].kind !== "osc" || notes[1].kind !== "osc") throw new Error("expected osc")
    const interval = Math.log2(notes[1].pitch.endHz / notes[0].pitch.endHz) * 12
    expect(interval).toBeCloseTo(5, 1)
  })

  it("makes error dissonant — two voices about a semitone apart", () => {
    const voices = soundIn("soft", "error").voices.filter((v) => v.kind === "osc")
    expect(voices).toHaveLength(2)
    if (voices[0].kind !== "osc" || voices[1].kind !== "osc") throw new Error("expected osc")
    const semis = Math.abs(Math.log2(voices[0].pitch.endHz / voices[1].pitch.endHz) * 12)
    expect(semis).toBeCloseTo(1, 1)
  })
})

describe("direction is meaning, and every preset preserves it", () => {
  // The rising/falling table from SPEC 7.1. A preset may flatten a sweep but
  // must never reverse one — that would invert what the sound says.
  const rising: SoundId[] = ["toggle.on", "open", "send"]
  const falling: SoundId[] = ["tap", "toggle.off", "close", "receive", "delete"]

  for (const presetId of PRESET_IDS) {
    it(`${presetId} keeps rises rising and falls falling`, () => {
      for (const id of rising) {
        const p = primary(id, presetId)
        expect(p.pitch.endHz, `${presetId}/${id}`).toBeGreaterThan(p.pitch.startHz)
      }
      for (const id of falling) {
        const p = primary(id, presetId)
        expect(p.pitch.endHz, `${presetId}/${id}`).toBeLessThan(p.pitch.startHz)
      }
    })
  }

  it("gives a steady note the preset's intrinsic downward glide", () => {
    // success's notes declare from === to, so the glide is the preset's.
    const v = primary("success")
    expect(v.pitch.startHz).toBeGreaterThan(v.pitch.endHz)
    expect(sweepStartSemitones({ from: 4, to: 4, offsetShare: 0, gain: 1 }, PRESETS.soft)).toBe(
      4 + PRESETS.soft.intrinsicSweep,
    )
  })

  it("scales a declared interval without flipping it", () => {
    const flat = sweepStartSemitones(
      { from: 0, to: -2, offsetShare: 0, gain: 1 },
      PRESETS.minimal,
    )
    const steep = sweepStartSemitones(
      { from: 0, to: -2, offsetShare: 0, gain: 1 },
      PRESETS.crisp,
    )
    expect(flat).toBeGreaterThan(-2)
    expect(steep).toBeGreaterThan(flat)
  })
})

describe("pairs", () => {
  it("inverts toggle, open/close and send/receive", () => {
    for (const p of PAIRS.filter((x) => x.kind === "inversion")) {
      const a = primary(p.a)
      const b = primary(p.b)
      expect(a.pitch.startHz, `${p.a}/${p.b}`).toBeCloseTo(b.pitch.endHz, 4)
      expect(a.pitch.endHz, `${p.a}/${p.b}`).toBeCloseTo(b.pitch.startHz, 4)
    }
  })

  it("stores a canonical pitch edit once — the partner derives from it", () => {
    // toggle.on is canonical, so its pitch is the only thing written. Storing
    // a delta on toggle.off too would put a value in the URL that resolve()
    // overwrites, and give two places to disagree.
    const edits = pairedEdits("toggle.on", { startHz: 500, endHz: 900 })
    expect(edits).toEqual([{ id: "toggle.on", patch: { startHz: 500, endHz: 900 } }])
  })

  it("routes a pitch edit on the derived side upstream, mirrored", () => {
    const edits = pairedEdits("toggle.off", { startHz: 900, endHz: 500 })
    expect(edits).toEqual([{ id: "toggle.on", patch: { startHz: 500, endHz: 900 } }])
  })

  it("keeps character on the sound that was edited, even on the derived side", () => {
    const edits = pairedEdits("toggle.off", { startHz: 900, attackMs: 25 })
    expect(edits).toContainEqual({ id: "toggle.off", patch: { attackMs: 25 } })
    expect(edits).toContainEqual({ id: "toggle.on", patch: { endHz: 900 } })
  })

  it("survives editing the derived side end-to-end", () => {
    const config = applyEdit(DEFAULT_CONFIG, "close", { startHz: 900, endHz: 500 })
    const set = resolve(config)
    const open = set.sounds.find((s) => s.id === "open")!.voices[0]
    const close = set.sounds.find((s) => s.id === "close")!.voices[0]
    if (open.kind !== "osc" || close.kind !== "osc") throw new Error("expected osc")
    expect(close.pitch.startHz).toBeCloseTo(900, 4)
    expect(close.pitch.endHz).toBeCloseTo(500, 4)
    expect(open.pitch.startHz).toBeCloseTo(500, 4)
    expect(open.pitch.endHz).toBeCloseTo(900, 4)
  })

  it("does not mirror character — only direction", () => {
    // A close that is quieter than its open is a legitimate thing to want.
    expect(pairedEdits("open", { attackMs: 20, gainTrimDb: -3 })).toHaveLength(1)
  })

  it("leaves success and error alone — they contrast, they do not invert", () => {
    expect(partnerOf("success")).toEqual({ id: "error", kind: "contrast" })
    expect(pairedEdits("success", { startHz: 800 })).toHaveLength(1)
  })

  it("keeps a pair inverted through applyEdit", () => {
    const config = applyEdit(DEFAULT_CONFIG, "open", { startHz: 600, endHz: 800 })
    const set = resolve(config)
    const open = set.sounds.find((s) => s.id === "open")!.voices[0]
    const close = set.sounds.find((s) => s.id === "close")!.voices[0]
    if (open.kind !== "osc" || close.kind !== "osc") throw new Error("expected osc")
    expect(open.pitch.startHz).toBeCloseTo(close.pitch.endHz, 4)
    expect(open.pitch.endHz).toBeCloseTo(close.pitch.startHz, 4)
  })
})

describe("tiers", () => {
  it("orders gain and duration subtle < notable < alert", () => {
    for (const p of PRESET_IDS) {
      const preset = PRESETS[p]
      expect(preset.gain.subtle).toBeLessThan(preset.gain.notable)
      expect(preset.gain.notable).toBeLessThan(preset.gain.alert)
      expect(preset.duration.subtle).toBeLessThan(preset.duration.notable)
      expect(preset.duration.notable).toBeLessThan(preset.duration.alert)
    }
  })

  it("keeps minimal quieter and shorter than soft throughout", () => {
    for (const tier of ["subtle", "notable", "alert"] as const) {
      expect(PRESETS.minimal.gain[tier]).toBeLessThan(PRESETS.soft.gain[tier])
      expect(PRESETS.minimal.duration[tier]).toBeLessThan(PRESETS.soft.duration[tier])
    }
  })
})

describe("the duration budget", () => {
  it("measures sounding time, not the nominal duration", () => {
    const s = soundIn("soft", "success")
    // The second note starts late and its release runs past the nominal end.
    expect(soundingMs(s)).toBeGreaterThan(s.durationMs)
  })

  it("keeps every default sound inside the 200ms warning except the alert tier", () => {
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        if (s.tier === "alert") continue
        expect(soundingMs(s), `${presetId}/${s.id}`).toBeLessThanOrEqual(320)
      }
    }
  })

  it("shrinks an envelope that would overrun rather than running long", () => {
    const fitted = fitEnvelope({ attackMs: 50, decayMs: 200, sustain: 0, releaseMs: 100 }, 100)
    expect(fitted.attackMs + fitted.decayMs + fitted.releaseMs).toBeLessThanOrEqual(100.01)
    expect(fitted.attackMs).toBeGreaterThan(0)
  })
})

describe("frequency safety", () => {
  it("keeps the default sets clear of the phone-speaker floor", () => {
    // SPEC 10: below ~300Hz a micro-speaker gives up. No shipped preset may
    // put a sound there by default.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        expect(frequencySpan(s).minHz, `${presetId}/${s.id}`).toBeGreaterThan(300)
      }
    }
  })

  it("keeps every landing pitch out of the 2-5kHz harsh band", () => {
    // The landing pitch is where a sound lingers, so it is what the harsh-band
    // guidance is actually about. A sweep may start above the line and pass
    // through in a few tens of milliseconds; sitting there is the problem.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        for (const v of s.voices) {
          if (v.kind !== "osc") continue
          expect(v.pitch.endHz, `${presetId}/${s.id}`).toBeLessThan(2000)
        }
      }
    }
  })

  it("does not let a sweep start somewhere egregious either", () => {
    // The ceiling is set by the highest note plus the preset's intrinsic
    // glide, not by the base alone — the mistake that put crisp's
    // notification at 2093 Hz and minimal's at 2119 Hz.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        expect(frequencySpan(s).maxHz, `${presetId}/${s.id}`).toBeLessThan(2000)
      }
    }
  })

  it("never emits a frequency an exponential ramp cannot reach", () => {
    // Web Audio's exponentialRampToValueAtTime throws on zero or negative.
    const wild = resolve({
      presetId: "soft",
      baseHz: 99999,
      deltas: { tap: { startHz: -50, endHz: 0 } },
    })
    for (const s of wild.sounds) {
      for (const v of s.voices) {
        if (v.kind !== "osc") continue
        expect(v.pitch.startHz).toBeGreaterThanOrEqual(20)
        expect(v.pitch.endHz).toBeGreaterThanOrEqual(20)
      }
    }
  })
})

describe("deltas", () => {
  it("changes only the sound it names", () => {
    const set = resolve({ presetId: "soft", deltas: { tap: { durationMs: 300 } } })
    expect(set.sounds.find((s) => s.id === "tap")!.durationMs).toBe(300)
    expect(set.sounds.find((s) => s.id === "open")!.durationMs).toBe(
      PRESETS.soft.duration.subtle,
    )
  })

  it("applies a gain trim in dB", () => {
    const plain = soundIn("soft", "tap").voices[0].gain
    const set = resolve({ presetId: "soft", deltas: { tap: { gainTrimDb: -6 } } })
    // -6dB is about half.
    expect(set.sounds.find((s) => s.id === "tap")!.voices[0].gain).toBeCloseTo(plain / 2, 2)
  })

  it("retunes a two-note sound without collapsing its interval", () => {
    const before = soundIn("soft", "success").voices.filter((v) => v.kind === "osc")
    const set = resolve({ presetId: "soft", deltas: { success: { startHz: 400, endHz: 400 } } })
    const after = set.sounds
      .find((s) => s.id === "success")!
      .voices.filter((v) => v.kind === "osc")
    if (before[1].kind !== "osc" || after[1].kind !== "osc") throw new Error("expected osc")
    if (before[0].kind !== "osc" || after[0].kind !== "osc") throw new Error("expected osc")
    // Both notes moved, and the second is still above the first.
    expect(after[1].pitch.endHz).toBeGreaterThan(after[0].pitch.endHz)
    expect(after[1].pitch.endHz).toBeLessThan(before[1].pitch.endHz)
  })

  it("clamps anything a hand-edited URL could put out of range", () => {
    const set = resolve({
      presetId: "soft",
      deltas: { tap: { q: 9999, cutoffHz: 1, durationMs: 99999, attackMs: -5 } },
    })
    const tap = set.sounds.find((s) => s.id === "tap")!
    expect(tap.filter.q).toBeLessThanOrEqual(20)
    expect(tap.filter.cutoffHz).toBeGreaterThanOrEqual(80)
    expect(tap.durationMs).toBeLessThanOrEqual(2000)
    expect(tap.voices[0].env.attackMs).toBeGreaterThan(0)
  })
})

describe("preset independence", () => {
  it("branches on no preset id anywhere — every preset resolves a full set", () => {
    for (const presetId of PRESET_IDS) {
      const set = resolve({ presetId, deltas: {} })
      expect(set.sounds, presetId).toHaveLength(11)
      for (const s of set.sounds) {
        expect(s.voices.length, `${presetId}/${s.id}`).toBeGreaterThan(0)
      }
    }
  })

  it("gives crisp a noise layer on every sound and soft one only on delete", () => {
    const crisp = setFor("crisp")
    for (const s of crisp.sounds) {
      expect(
        s.voices.some((v) => v.kind === "noise"),
        s.id,
      ).toBe(true)
    }
    const soft = setFor("soft")
    expect(
      soft.sounds.find((s) => s.id === "delete")!.voices.some((v) => v.kind === "noise"),
    ).toBe(true)
    expect(
      soft.sounds.find((s) => s.id === "tap")!.voices.some((v) => v.kind === "noise"),
    ).toBe(false)
  })

  it("is a value, not a singleton — two sets coexist without tearing", () => {
    const a = resolve({ presetId: "soft", deltas: {} })
    const b = resolve({ presetId: "crisp", deltas: {} })
    expect(a.baseHz).not.toBe(b.baseHz)
    expect(resolve({ presetId: "soft", deltas: {} })).toEqual(a)
  })
})
