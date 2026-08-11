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
  DURATION_BUDGET,
  durationVerdict,
  applyEdit,
  envelopeFor,
  envelopeMs,
  frequencySpan,
  MIN_MUSICAL_HZ,
  pairedEdits,
  resolve,
  semitonesToHz,
  soundingMs,
  sweepStartSemitones,
} from "./resolve.js"
import { PRESETS, PRESET_IDS } from "./presets.js"
import { PAIRS, SOUND_IDS, SOUND_SPECS, notesFor, partnerOf, type SoundId } from "./sounds.js"

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
    // tap is flat at the base itself — neutral, mid, no travel.
    const base = PRESETS.soft.baseHz
    expect(primary("tap").pitch.endHz).toBeCloseTo(semitonesToHz(base, 0), 4)
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

  it("drops delete a full octave, in two steps", () => {
    // `descend` is stepped, so delete is two notes: base, then an octave down.
    // That is what "flat, then descends" means — not a glide.
    const notes = soundIn("soft", "delete").voices.filter((v) => v.kind === "osc")
    if (notes[0].kind !== "osc" || notes[1].kind !== "osc") throw new Error("expected osc")
    expect(notes[0].pitch.endHz).toBeCloseTo(PRESETS.soft.baseHz, 4)
    expect(notes[1].pitch.endHz).toBeCloseTo(PRESETS.soft.baseHz / 2, 4)
    expect(notes[1].startOffsetMs).toBeGreaterThan(0)
  })

  it("steps success up a perfect fourth", () => {
    const notes = soundIn("soft", "success").voices.filter((v) => v.kind === "osc")
    if (notes[0].kind !== "osc" || notes[1].kind !== "osc") throw new Error("expected osc")
    const interval = Math.log2(notes[1].pitch.endHz / notes[0].pitch.endHz) * 12
    expect(interval).toBeCloseTo(5, 1)
    // Ascending, and the second note lands late — a figure, not a chord.
    expect(notes[1].pitch.endHz).toBeGreaterThan(notes[0].pitch.endHz)
    expect(notes[1].startOffsetMs).toBeGreaterThan(0)
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
  it("orders gain and length subtle < notable < alert", () => {
    for (const p of PRESET_IDS) {
      const preset = PRESETS[p]
      expect(preset.gain.subtle).toBeLessThan(preset.gain.notable)
      expect(preset.gain.notable).toBeLessThan(preset.gain.alert)
      expect(preset.envScale.subtle).toBeLessThan(preset.envScale.notable)
      expect(preset.envScale.notable).toBeLessThan(preset.envScale.alert)
    }
  })

  it("keeps minimal quieter and shorter than soft throughout", () => {
    for (const tier of ["subtle", "notable", "alert"] as const) {
      expect(PRESETS.minimal.gain[tier]).toBeLessThan(PRESETS.soft.gain[tier])
      expect(envelopeMs(envelopeFor(PRESETS.minimal, tier)), tier).toBeLessThan(
        envelopeMs(envelopeFor(PRESETS.soft, tier)),
      )
    }
  })

  it("stretches decay and release with the tier but never the attack", () => {
    // Attack is character. Stretching it for an alert makes the alert mushy.
    for (const p of PRESET_IDS) {
      const subtle = envelopeFor(PRESETS[p], "subtle")
      const alert = envelopeFor(PRESETS[p], "alert")
      expect(alert.attackMs, p).toBe(subtle.attackMs)
      expect(alert.decayMs, p).toBeGreaterThan(subtle.decayMs)
      expect(alert.releaseMs, p).toBeGreaterThan(subtle.releaseMs)
    }
  })
})

describe("the duration budget", () => {
  it("measures sounding time, not the nominal duration", () => {
    const s = soundIn("soft", "success")
    // The second note starts late and its release runs past the nominal end.
    expect(soundingMs(s)).toBeGreaterThan(s.durationMs)
  })

  it("ships no default outside its tier's window, either end", () => {
    // A preset whose defaults trip the tool's own warning would undermine every
    // warning it shows. Both ends matter: too long overlaps the next
    // interaction, too short is inaudible however far you turn it up.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        expect(
          durationVerdict(s),
          `${presetId}/${s.id} at ${Math.round(soundingMs(s))}ms`,
        ).toBe("ok")
      }
    }
  })

  it("clears the floor where the ear stops integrating", () => {
    // Below ~70ms a sound is heard as quieter than the same waveform held
    // longer, so shortening past this buys nothing and costs audibility. This
    // is the bound that caught Minimal's 31ms tap.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        expect(soundingMs(s), `${presetId}/${s.id}`).toBeGreaterThanOrEqual(
          DURATION_BUDGET[s.tier].minMs,
        )
      }
    }
  })

  it("gives each tier real room, not three shades of blip", () => {
    // The whole point of the change: notable and alert sounds mark moments and
    // are allowed to be figures. If the tiers collapse back together the
    // budget has stopped meaning anything.
    for (const presetId of PRESET_IDS) {
      const set = setFor(presetId)
      const ms = (id: SoundId) => soundingMs(set.sounds.find((s) => s.id === id)!)
      expect(ms("notification"), presetId).toBeGreaterThan(ms("send") * 1.4)
      expect(ms("send"), presetId).toBeGreaterThan(ms("tap") * 1.4)
    }
  })

  it("still orders the tiers by length after that cap", () => {
    for (const presetId of PRESET_IDS) {
      const set = setFor(presetId)
      const len = (id: SoundId) => set.sounds.find((s) => s.id === id)!.durationMs
      expect(len("tap"), presetId).toBeLessThan(len("send"))
      expect(len("send"), presetId).toBeLessThan(len("delete"))
    }
  })

  it("takes its length FROM the envelope, so an edit lands where you put it", () => {
    // The bug this replaced: duration was authored separately and the envelope
    // was squeezed to fit it, so dragging attack rescaled all three segments —
    // the slider settled somewhere you did not choose, and decay and release
    // moved on their own.
    const set = resolve({ presetId: "soft", deltas: { tap: { attackMs: 20 } } })
    const tap = set.sounds.find((s) => s.id === "tap")!
    const plain = resolve(DEFAULT_CONFIG).sounds.find((s) => s.id === "tap")!

    expect(tap.voices[0].env.attackMs).toBe(20)
    // Only the attack moved. Everything else held still.
    expect(tap.voices[0].env.decayMs).toBe(plain.voices[0].env.decayMs)
    expect(tap.voices[0].env.releaseMs).toBe(plain.voices[0].env.releaseMs)
    // And the sound grew by exactly what was added.
    expect(tap.durationMs - plain.durationMs).toBeCloseTo(20 - plain.voices[0].env.attackMs, 6)
  })

  it("does not drag the glide along when the attack changes", () => {
    // A milder version of the same bug: the glide used to derive from the
    // whole envelope, so raising the attack visibly moved a slider nobody had
    // touched. It derives from decay + release instead.
    const plain = resolve(DEFAULT_CONFIG).sounds.find((s) => s.id === "tap")!
    const edited = resolve({
      presetId: "soft",
      deltas: { tap: { attackMs: 24 } },
    }).sounds.find((s) => s.id === "tap")!
    const glide = (s: typeof plain) =>
      s.voices[0].kind === "osc" ? s.voices[0].pitch.sweepMs : 0
    expect(glide(edited)).toBeCloseTo(glide(plain), 6)
  })

  it("keeps every envelope edit independent of every other", () => {
    const set = resolve({
      presetId: "crisp",
      deltas: { send: { attackMs: 12, decayMs: 80, releaseMs: 30 } },
    })
    const send = set.sounds.find((s) => s.id === "send")!.voices[0]
    expect(send.env.attackMs).toBe(12)
    expect(send.env.decayMs).toBe(80)
    expect(send.env.releaseMs).toBe(30)
    expect(envelopeMs(send.env)).toBeCloseTo(122, 6)
  })
})

describe("frequency safety", () => {
  it("keeps the default sets clear of the small-speaker floor", () => {
    // SPEC 10: below ~300Hz a small speaker gives up. No shipped preset may
    // put a sound there by default.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        expect(frequencySpan(s).minHz, `${presetId}/${s.id}`).toBeGreaterThan(300)
      }
    }
  })

  it("keeps every DOMINANT landing pitch out of the 2-5kHz harsh band", () => {
    // Two qualifications, and both are the honest reading of the guidance
    // rather than a way to make the numbers pass.
    //
    // *Landing*, because that is where a sound lingers. A sweep may start
    // above the line and pass through in tens of milliseconds — that is what
    // a Sci-Fi zap IS — and sitting there is the actual problem.
    //
    // *Dominant*, because a preset layer at a fraction of the stack's level is
    // colour, not content. Glassy's twelfth sits at 4.8 kHz by design; it is
    // an overtone at roughly a tenth of the gain, and it is what makes a bell
    // sound like a bell. Judging it as though it were the note would ban every
    // bright preset for a problem nobody can hear.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        const osc = s.voices.filter((v) => v.kind === "osc")
        const loudest = Math.max(...osc.map((v) => v.gain))
        for (const v of osc) {
          if (v.kind !== "osc" || v.gain < loudest * 0.5) continue
          expect(v.pitch.endHz, `${presetId}/${s.id}`).toBeLessThan(2000)
        }
      }
    }
  })

  it("still keeps every voice, however quiet, out of genuinely painful territory", () => {
    // The ceiling colour layers and zap sweeps are allowed to reach. Above
    // this nothing is buying character any more.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        expect(frequencySpan(s).maxHz, `${presetId}/${s.id}`).toBeLessThan(6000)
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
    const set = resolve({ presetId: "soft", deltas: { tap: { decayMs: 300 } } })
    const untouched = resolve(DEFAULT_CONFIG)
    expect(set.sounds.find((s) => s.id === "tap")!.voices[0].env.decayMs).toBe(300)
    expect(set.sounds.find((s) => s.id === "open")!.durationMs).toBe(
      untouched.sounds.find((s) => s.id === "open")!.durationMs,
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
      deltas: { tap: { q: 9999, cutoffHz: 1, sweepMs: 99999, attackMs: -5 } },
    })
    const tap = set.sounds.find((s) => s.id === "tap")!
    expect(tap.filter.q).toBeLessThanOrEqual(20)
    expect(tap.filter.cutoffHz).toBeGreaterThanOrEqual(80)
    expect(tap.voices[0].kind === "osc" && tap.voices[0].pitch.sweepMs).toBeLessThanOrEqual(
      2000,
    )
    expect(tap.voices[0].env.attackMs).toBeGreaterThan(0)
  })
})

describe("the three axes", () => {
  it("orders the set the way the design language reads", () => {
    expect(SOUND_IDS).toEqual([
      "tap",
      "notification",
      "open",
      "close",
      "send",
      "receive",
      "toggle.on",
      "toggle.off",
      "success",
      "error",
      "delete",
    ])
  })

  it("orders the registers against each other", () => {
    // Register is a DECLARED label, not a derived one, and trying to compute
    // it from a single number does not survive contact with the travelling
    // shapes: `close` starts high and lands mid, `delete` starts mid and lands
    // low. Both are honestly "mid" to a listener and neither has one number
    // that says so.
    //
    // What must hold is the ordering — lower really is below mid really is
    // below higher — which is the part a listener would notice being wrong.
    const meanCenter = (register: string) => {
      const group = SOUND_SPECS.filter((x) => x.register === register)
      return group.reduce((sum, x) => sum + x.center, 0) / group.length
    }
    expect(meanCenter("lower")).toBeLessThan(meanCenter("mid"))
    expect(meanCenter("mid")).toBeLessThan(meanCenter("higher"))
  })

  it("makes every mirrored shape an exact inversion of its twin", () => {
    // The whole reason shapes are a closed vocabulary rather than free-form
    // note lists: two hand-written specs that merely LOOK like mirrors stop
    // being mirrors the moment anything scales them.
    //
    // Compared as a flattened pitch sequence, because the mirror works
    // differently for the two kinds — a scoop reverses WITHIN one note, a
    // stepped figure reverses the ORDER of its notes. Reversing the sequence
    // covers both without special-casing either.
    const sequence = (shape: Parameters<typeof notesFor>[0]) =>
      notesFor(shape, 3, 7).flatMap((n) => [n.from, n.to])

    for (const [up, down] of [
      ["scoopUp", "scoopDown"],
      ["expand", "collapse"],
      ["ascend", "descend"],
    ] as const) {
      expect([...sequence(up)].reverse(), `${up} vs ${down}`).toEqual(sequence(down))
    }
  })

  it("makes a scoop continuous and an ascent stepped", () => {
    // Both go up; they must not sound alike. A scoop is one note bending, an
    // ascent is two distinct notes.
    const scoop = soundIn("soft", "send").voices.filter((v) => v.kind === "osc")
    const step = soundIn("soft", "success").voices.filter((v) => v.kind === "osc")
    expect(scoop).toHaveLength(1)
    expect(step).toHaveLength(2)
    if (scoop[0].kind !== "osc") throw new Error("expected osc")
    // The scoop travels within one note.
    expect(scoop[0].pitch.endHz).toBeGreaterThan(scoop[0].pitch.startHz)
  })

  it("gives negative valence its dissonance, and nothing else", () => {
    // error is dissonant because it is NEGATIVE, not because a dissonance was
    // written into that one sound. Positive and neutral sounds get no extra
    // voice at all.
    const err = soundIn("soft", "error").voices.filter((v) => v.kind === "osc")
    expect(err).toHaveLength(2)
    if (err[0].kind !== "osc" || err[1].kind !== "osc") throw new Error("expected osc")
    const semis = Math.abs(Math.log2(err[0].pitch.endHz / err[1].pitch.endHz) * 12)
    expect(semis).toBeCloseTo(1, 1)

    // tap is neutral and flat — one voice, no colour.
    expect(soundIn("soft", "tap").voices.filter((v) => v.kind === "osc")).toHaveLength(1)
  })

  it("brightens the positive and darkens the negative", () => {
    const positive = soundIn("soft", "send").filter.cutoffHz
    const neutral = soundIn("soft", "tap").filter.cutoffHz
    const negative = soundIn("soft", "error").filter.cutoffHz
    expect(positive).toBeGreaterThan(neutral)
    expect(negative).toBeLessThan(neutral)
    // And hardens it — resonance rises with negativity.
    expect(soundIn("soft", "error").filter.q).toBeGreaterThan(soundIn("soft", "tap").filter.q)
  })

  it("sweeps the filter for expand and collapse, and only those", () => {
    // Pitch alone cannot express opening out. A menu appearing should widen.
    const open = soundIn("soft", "open").filter
    const close = soundIn("soft", "close").filter
    expect(open.endCutoffHz).toBeGreaterThan(open.cutoffHz)
    expect(close.endCutoffHz).toBeLessThan(close.cutoffHz)

    // The DIRECTION mirrors; the absolute values do not, and should not.
    // `open` is positive and `close` neutral, so open sits brighter throughout.
    // That is the pair rule working as designed — contour inverts exactly,
    // character is free to differ.
    const ratio = (f: typeof open) => f.endCutoffHz! / f.cutoffHz
    expect(ratio(open)).toBeCloseTo(1 / ratio(close), 4)
    expect(open.cutoffHz).toBeGreaterThan(close.endCutoffHz!)

    expect(soundIn("soft", "tap").filter.endCutoffHz).toBeUndefined()
  })

  it("never lets an aggressive preset dive out of audibility", () => {
    // Sci-Fi's 3x sweep on send's seven-semitone scoop reached 274 Hz before
    // the floor existed — inside the small-speaker rolloff and effectively
    // silent on a laptop.
    for (const presetId of PRESET_IDS) {
      for (const s of setFor(presetId).sounds) {
        for (const v of s.voices) {
          if (v.kind !== "osc") continue
          expect(v.pitch.startHz, `${presetId}/${s.id}`).toBeGreaterThanOrEqual(MIN_MUSICAL_HZ)
          expect(v.pitch.endHz, `${presetId}/${s.id}`).toBeGreaterThanOrEqual(MIN_MUSICAL_HZ)
        }
      }
    }
  })
})

describe("preset layers — the thing that makes presets instruments", () => {
  it("expands every semantic note through the whole stack", () => {
    // glassy is three layers; success is two notes. Six oscillators, not two.
    const success = soundIn("glassy", "success")
    const osc = success.voices.filter((v) => v.kind === "osc")
    expect(osc).toHaveLength(PRESETS.glassy.layers.length * 2)
  })

  it("normalises the stack, so a three-layer preset is not three times louder", () => {
    // Otherwise the loud presets would clip on the way to being measured, and
    // a preset's `gain` table would mean something different per preset.
    for (const presetId of PRESET_IDS) {
      const preset = PRESETS[presetId]
      const tap = soundIn(presetId, "tap")
      const oscGain = tap.voices
        .filter((v) => v.kind === "osc")
        .reduce((sum, v) => sum + v.gain, 0)
      expect(oscGain, presetId).toBeCloseTo(preset.gain.subtle, 5)
    }
  })

  it("places layers at their stated interval above the note", () => {
    const tap = soundIn("glassy", "tap")
    const osc = tap.voices.filter((v) => v.kind === "osc")
    if (osc[0].kind !== "osc") throw new Error("expected osc")
    for (const [i, layer] of PRESETS.glassy.layers.entries()) {
      const v = osc[i]
      if (v.kind !== "osc") throw new Error("expected osc")
      const semis = Math.log2(v.pitch.endHz / osc[0].pitch.endHz) * 12
      expect(semis, `layer ${i}`).toBeCloseTo(layer.interval, 4)
    }
  })

  it("detunes in cents rather than hertz, so the beat tracks the sweep", () => {
    const warmTap = soundIn("warm", "tap")
    const twin = warmTap.voices.find((v) => v.kind === "osc" && v.detuneCents)
    expect(twin).toBeDefined()
    if (twin?.kind !== "osc") throw new Error("expected osc")
    expect(twin.detuneCents).toBe(9)
    // A detuned twin is at the SAME frequency — the offset is applied by the
    // oscillator, not baked into the pitch, so it holds across the glide.
    const first = warmTap.voices.find((v) => v.kind === "osc")
    if (first?.kind !== "osc") throw new Error("expected osc")
    expect(twin.pitch.startHz).toBeCloseTo(first.pitch.startHz, 6)
  })

  it("lets a layer ring on past the note under it", () => {
    const tap = soundIn("glassy", "tap")
    const osc = tap.voices.filter((v) => v.kind === "osc")
    if (osc[0].kind !== "osc" || osc[2].kind !== "osc") throw new Error("expected osc")
    expect(osc[2].env.decayMs).toBeGreaterThan(osc[0].env.decayMs)
  })

  it("tags each voice with its layer, so the editor addresses the note", () => {
    const tap = soundIn("glassy", "tap")
    const osc = tap.voices.filter((v) => v.kind === "osc")
    expect(osc.map((v) => (v.kind === "osc" ? v.layer : -1))).toEqual([0, 1, 2])
  })

  it("carries the glide mode, and only retro steps", () => {
    expect(soundIn("retro", "tap").glide).toBe("stepped")
    for (const presetId of PRESET_IDS.filter((p) => p !== "retro")) {
      expect(soundIn(presetId, "tap").glide, presetId).toBe("smooth")
    }
  })

  it("keeps pairs inverted even with a stack on top", () => {
    // invertPitches walks oscillator voices in order, so a three-layer preset
    // has to mirror layer-for-layer or the shimmer would end up on the wrong
    // half of the pair.
    for (const presetId of PRESET_IDS) {
      const set = setFor(presetId)
      const open = set.sounds
        .find((s) => s.id === "open")!
        .voices.filter((v) => v.kind === "osc")
      const close = set.sounds
        .find((s) => s.id === "close")!
        .voices.filter((v) => v.kind === "osc")
      expect(close.length, presetId).toBe(open.length)
      for (const [i, o] of open.entries()) {
        const c = close[i]
        if (o.kind !== "osc" || c.kind !== "osc") throw new Error("expected osc")
        expect(o.pitch.startHz, `${presetId} layer ${i}`).toBeCloseTo(c.pitch.endHz, 4)
      }
    }
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
