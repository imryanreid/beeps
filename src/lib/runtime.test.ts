// ==============================================
// RUNTIME TESTS
// The synthesis graph, checked against a recording
// mock of the Web Audio API.
//
// Everything asserted here fails SILENTLY in a real
// browser — an exponential ramp starting at zero does
// nothing at all rather than throwing, and a node cut
// at non-zero amplitude just clicks. There is no
// error to catch and no test that hears it, so the
// automation calls themselves are what get checked.
// ==============================================
import { describe, expect, it } from "vitest"
import { createBeeps, envelopeSegments, scheduleSound } from "../runtime/beeps.js"
import { resolve, DEFAULT_CONFIG } from "./resolve.js"
import { PRESET_IDS } from "./presets.js"

// ---------------------------------------------------------------------------
// A recording stand-in for the parts of Web Audio the runtime touches.
// ---------------------------------------------------------------------------

type Call = { method: string; value: number; time: number }

class FakeParam {
  calls: Call[] = []
  setValueAtTime(value: number, time: number) {
    this.calls.push({ method: "set", value, time })
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: "linear", value, time })
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.calls.push({ method: "exponential", value, time })
  }
}

class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()
  Q = new FakeParam()
  type = ""
  buffer: unknown = null
  onended: (() => void) | null = null
  started: number | null = null
  stopped: number | null = null
  connections: FakeNode[] = []
  disconnected = false
  connect(target: FakeNode) {
    this.connections.push(target)
  }
  disconnect() {
    this.disconnected = true
  }
  start(t: number) {
    this.started = t
  }
  stop(t: number) {
    this.stopped = t
  }
}

class FakeContext {
  currentTime = 0
  sampleRate = 44100
  state = "running"
  destination = new FakeNode()
  oscillators: FakeNode[] = []
  sources: FakeNode[] = []
  gains: FakeNode[] = []
  filters: FakeNode[] = []
  resumed = 0

  createOscillator() {
    const n = new FakeNode()
    this.oscillators.push(n)
    return n
  }
  createBufferSource() {
    const n = new FakeNode()
    this.sources.push(n)
    return n
  }
  createGain() {
    const n = new FakeNode()
    this.gains.push(n)
    return n
  }
  createBiquadFilter() {
    const n = new FakeNode()
    this.filters.push(n)
    return n
  }
  createBuffer(channels: number, frames: number) {
    return { getChannelData: () => new Float32Array(frames), length: frames, channels }
  }
  resume() {
    this.resumed++
  }
  close() {}
}

const fake = () => new FakeContext() as unknown as BaseAudioContext & FakeContext

const set = resolve(DEFAULT_CONFIG)
const soundBy = (id: string) => set.sounds.find((s) => s.id === id)!

// ---------------------------------------------------------------------------

describe("envelope segments", () => {
  it("does not pad a percussive sound out with silence", () => {
    // sustain 0 means the sound is over once it has decayed. Padding to the
    // duration budget would make the 200ms warning measure dead air.
    const seg = envelopeSegments({ attackMs: 5, decayMs: 30, sustain: 0, releaseMs: 10 }, 500)
    expect(seg.sustainTime).toBe(0)
    expect(seg.totalMs).toBeCloseTo(47, 5)
  })

  it("holds only when the sound actually sustains", () => {
    const seg = envelopeSegments({ attackMs: 5, decayMs: 30, sustain: 0.5, releaseMs: 10 }, 200)
    expect(seg.sustainTime).toBeCloseTo(155, 5)
  })

  it("never returns a negative hold", () => {
    const seg = envelopeSegments({ attackMs: 90, decayMs: 90, sustain: 0.5, releaseMs: 90 }, 50)
    expect(seg.sustainTime).toBe(0)
  })
})

describe("the envelope, which fails silently when it is wrong", () => {
  it("ramps the attack LINEARLY from a true zero", () => {
    // exponentialRampToValueAtTime cannot start at zero — it does nothing at
    // all, which is the usual way an envelope ends up with no attack.
    const ctx = fake()
    scheduleSound(ctx, ctx.destination, soundBy("tap"), 0)
    const env = ctx.gains.find((g) => g.gain.calls.length > 2)!
    const first = env.gain.calls[0]
    expect(first).toEqual({ method: "set", value: 0, time: 0 })
    expect(env.gain.calls[1].method).toBe("linear")
    expect(env.gain.calls[1].value).toBeGreaterThan(0)
  })

  it("never asks for an exponential ramp to zero", () => {
    const ctx = fake()
    for (const s of set.sounds) scheduleSound(ctx, ctx.destination, s, 0)
    for (const node of [...ctx.gains, ...ctx.oscillators, ...ctx.filters]) {
      for (const param of [node.gain, node.frequency, node.Q]) {
        for (const call of param.calls) {
          if (call.method !== "exponential") continue
          expect(call.value, JSON.stringify(call)).toBeGreaterThan(0)
        }
      }
    }
  })

  it("finishes at true zero, so the tail does not click", () => {
    const ctx = fake()
    scheduleSound(ctx, ctx.destination, soundBy("tap"), 0)
    const env = ctx.gains.find((g) => g.gain.calls.length > 2)!
    const last = env.gain.calls[env.gain.calls.length - 1]
    expect(last.method).toBe("linear")
    expect(last.value).toBe(0)
  })

  it("keeps every automation time moving forward", () => {
    // An out-of-order ramp is accepted by Web Audio and produces something
    // nobody designed.
    const ctx = fake()
    for (const s of set.sounds) scheduleSound(ctx, ctx.destination, s, 0)
    for (const node of ctx.gains) {
      let previous = -Infinity
      for (const call of node.gain.calls) {
        expect(call.time).toBeGreaterThanOrEqual(previous)
        previous = call.time
      }
    }
  })
})

describe("the graph", () => {
  it("routes every voice through the filter and the master gain", () => {
    const ctx = fake()
    scheduleSound(ctx, ctx.destination, soundBy("delete"), 0)
    const filter = ctx.filters[0]
    // delete carries a noise voice as well as its oscillator.
    expect(ctx.oscillators).toHaveLength(1)
    expect(ctx.sources).toHaveLength(1)
    // Master gain is the one connected to the destination.
    const master = ctx.gains.find((g) => g.connections.includes(ctx.destination))!
    expect(master.gain.calls[0].value).toBe(soundBy("delete").normalizedGain)
    expect(filter.connections).toContain(master)
  })

  it("steps the pitch on retro, and slides everywhere else", () => {
    // Chiptune hardware wrote pitch to a register, so it jumped. Sliding it
    // would sound like a broken portamento rather than an arpeggio.
    const retro = resolve({ presetId: "retro", deltas: {} })
    const ctx = fake()
    scheduleSound(
      ctx,
      ctx.destination,
      retro.sounds.find((s) => s.id === "delete")!,
      0,
    )
    const osc = ctx.oscillators[0]
    expect(osc.frequency.calls.every((c) => c.method === "set")).toBe(true)
    expect(osc.frequency.calls.length).toBeGreaterThan(3)
    // Steps are even in LOG space — evenly spaced in Hz they would bunch at
    // the top and stop sounding like intervals.
    const hz = osc.frequency.calls.map((c) => c.value)
    const ratios = hz.slice(1).map((v, i) => v / hz[i])
    for (const r of ratios.slice(1)) expect(r).toBeCloseTo(ratios[0], 4)
  })

  it("sweeps pitch exponentially, and only when it moves", () => {
    const ctx = fake()
    scheduleSound(ctx, ctx.destination, soundBy("delete"), 0)
    const osc = ctx.oscillators[0]
    expect(osc.frequency.calls[0].method).toBe("set")
    expect(osc.frequency.calls[1].method).toBe("exponential")
    expect(osc.frequency.calls[1].value).toBeLessThan(osc.frequency.calls[0].value)
  })

  it("starts and stops every source it makes", () => {
    const ctx = fake()
    for (const s of set.sounds) scheduleSound(ctx, ctx.destination, s, 0)
    for (const node of [...ctx.oscillators, ...ctx.sources]) {
      expect(node.started).not.toBeNull()
      expect(node.stopped).not.toBeNull()
      expect(node.stopped!).toBeGreaterThan(node.started!)
    }
  })

  it("releases its nodes when they end, so rapid-fire cannot leak", () => {
    const ctx = fake()
    scheduleSound(ctx, ctx.destination, soundBy("tap"), 0)
    const osc = ctx.oscillators[0]
    expect(osc.onended).toBeTypeOf("function")
    osc.onended!()
    expect(osc.disconnected).toBe(true)
  })

  it("offsets a delayed voice rather than stacking both notes at t0", () => {
    const ctx = fake()
    scheduleSound(ctx, ctx.destination, soundBy("success"), 0)
    const [first, second] = ctx.oscillators
    expect(second.started!).toBeGreaterThan(first.started!)
  })

  it("builds the same graph for every preset without special-casing one", () => {
    for (const presetId of PRESET_IDS) {
      const s = resolve({ presetId, deltas: {} })
      const ctx = fake()
      for (const sound of s.sounds) {
        expect(() => scheduleSound(ctx, ctx.destination, sound, 0)).not.toThrow()
      }
      expect(ctx.oscillators.length, presetId).toBeGreaterThanOrEqual(11)
    }
  })
})

describe("the player, and the mute gate", () => {
  const config = {
    baseHz: set.baseHz,
    sounds: Object.fromEntries(set.sounds.map((s) => [s.id, s])),
  }

  it("makes no sound until something enables it", () => {
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    expect(beeps.enabled).toBe(false)
    expect(beeps.play("tap")).toBe(false)
    expect(ctx.oscillators).toHaveLength(0)
  })

  it("plays once enabled", () => {
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    beeps.enable()
    expect(beeps.play("tap")).toBe(true)
    expect(ctx.oscillators).toHaveLength(1)
  })

  it("goes quiet again on disable", () => {
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    beeps.enabled = true
    beeps.play("tap")
    beeps.enabled = false
    beeps.play("tap")
    expect(ctx.oscillators).toHaveLength(1)
  })

  it("ignores an unknown id rather than throwing", () => {
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    beeps.enable()
    expect(beeps.play("nope")).toBe(false)
  })

  it("overlaps rapid-fire voices instead of cutting them off", () => {
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    beeps.enable()
    for (let i = 0; i < 10; i++) beeps.play("tap")
    // Ten separate oscillators, none stopped early by the next.
    expect(ctx.oscillators).toHaveLength(10)
    const cutShort = ctx.oscillators.filter((o) => o.stopped! <= o.started!)
    expect(cutShort).toHaveLength(0)
  })

  it("counts SOUNDS against the cap, not oscillators", () => {
    // A layered preset is many nodes per play — Glassy's `success` is six
    // oscillators plus a noise burst. Capping raw nodes would have cut
    // rapid-fire off after two plays on exactly the presets with the most
    // going on, which is the opposite of what that test is for.
    const glassy = resolve({ presetId: "glassy", deltas: {} })
    const config = {
      baseHz: glassy.baseHz,
      sounds: Object.fromEntries(glassy.sounds.map((s) => [s.id, s])),
    }
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    beeps.enable()
    for (let i = 0; i < 10; i++) beeps.play("success")

    const perPlay = glassy.sounds.find((s) => s.id === "success")!.voices.length
    expect(perPlay).toBeGreaterThan(4)
    // All ten plays got through; none was stopped early.
    const stoppedEarly = ctx.oscillators.filter((o) => o.stopped === ctx.currentTime)
    expect(stoppedEarly).toHaveLength(0)
  })

  it("caps polyphony so overlapping tails cannot climb into clipping", () => {
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    beeps.enable()
    for (let i = 0; i < 40; i++) beeps.play("tap")
    // Everything past the cap forces the oldest voice to stop at `now`, which
    // is earlier than the stop time it was scheduled with.
    const stoppedEarly = ctx.oscillators.filter((o) => o.stopped === ctx.currentTime)
    expect(stoppedEarly.length).toBeGreaterThan(0)
  })

  it("schedules a sequence forward in time", () => {
    const ctx = fake()
    const beeps = createBeeps(config, { context: ctx })
    beeps.enable()
    beeps.playSequence(["tap", "send", "success"], 200)
    const starts = ctx.oscillators.map((o) => o.started!).sort((a, b) => a - b)
    expect(starts[starts.length - 1]).toBeGreaterThan(starts[0])
  })

  it("resumes a suspended context, since that is the usual gesture failure", () => {
    const ctx = fake()
    ctx.state = "suspended"
    const beeps = createBeeps(config, { context: ctx })
    beeps.enable()
    expect(ctx.resumed).toBeGreaterThan(0)
  })
})
