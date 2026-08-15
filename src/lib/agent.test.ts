// ==============================================
// THE AGENT PAYLOAD
// Covers what /api/sounds and /api/render promise to
// anything reading this tool without a browser.
//
// This module had no tests at all, which is how a set
// could ship 5x over its own duration budget with
// nothing in the output saying so — the page flagged
// it in amber and the payload stayed quiet. Every
// assertion here is a claim llms.txt makes.
// ==============================================
import { describe, expect, it } from "vitest"
import { buildAgentPayload } from "./agent.js"
import { DURATION_BUDGET } from "./resolve.js"

const build = (search: string) => buildAgentPayload(search, "https://www.beeps.studio")
const soundIn = (search: string, id: string) => {
  const json = build(search).json as { sounds: Record<string, unknown>[] }
  return json.sounds.find((s) => s.id === id)! as Record<string, any>
}

describe("duration budgets", () => {
  it("flags a sound over its tier ceiling, per sound and for the set", () => {
    // tap is `subtle`, so 180ms is the ceiling. This is far past it.
    const { json, text } = build("?tap=d700.r300")
    const j = json as Record<string, any>
    const tap = j.sounds.find((s: any) => s.id === "tap")

    expect(tap.budget.verdict).toBe("long")
    expect(tap.budget.maxMs).toBe(DURATION_BUDGET.subtle.maxMs)
    expect(tap.budget.problem).toMatch(/exceeds the 180 ms ceiling/)
    // And at the top level, where a consumer reading only the header sees it.
    expect(j.budgetViolations).toEqual([expect.stringContaining("tap:")])
    expect(text).toContain("OUT OF BUDGET")
  })

  it("says nothing when every sound is inside its budget", () => {
    const j = build("") as unknown as { json: Record<string, any> }
    expect(build("").json).not.toHaveProperty("budgetViolations")
    expect(j).toBeDefined()
    for (const s of (build("").json as any).sounds) expect(s.budget.verdict).toBe("ok")
  })

  it("ships the tier budgets in the text format, not just the JSON", () => {
    // llms.txt claims the endpoint returns them. It did — but only as JSON.
    const { text } = build("")
    expect(text).toContain("TIER BUDGETS")
    expect(text).toMatch(/subtle\s+70-180 ms/)
  })
})

describe("telling an edited set from a stock one", () => {
  it("names the fields a link overrode", () => {
    const tap = soundIn("?tap=f800.a4", "tap")
    expect(tap.overrides).toEqual(["attackMs", "startHz"])
  })

  it("reports a per-sound voice, and only on the sound that has one", () => {
    expect(soundIn("?send=vbloopy", "send").voice).toBe("bloopy")
    expect(soundIn("?send=vbloopy", "tap")).not.toHaveProperty("voice")
  })

  it("omits both keys entirely on an untouched sound", () => {
    const tap = soundIn("", "tap")
    expect(tap).not.toHaveProperty("overrides")
    expect(tap).not.toHaveProperty("voice")
  })
})

describe("the dotted / hyphenated key round-trip", () => {
  it("accepts the id it prints, not only the URL spelling", () => {
    // The payload prints `toggle.on`; the URL wanted `toggle-on`. Copying the
    // printed name used to resolve to nothing and merely warn.
    const dotted = soundIn("?toggle.on=f900", "toggle.on")
    const hyphen = soundIn("?toggle-on=f900", "toggle.on")
    expect(dotted.pitchHz.start).toBe(900)
    expect(dotted.pitchHz).toEqual(hyphen.pitchHz)
  })

  it("no longer warns about a link that was in fact valid", () => {
    expect(build("?toggle.on=f900").json).not.toHaveProperty("warnings")
  })

  it("still rejects a key that names nothing, and now names it back", () => {
    const j = build("?nope=f900").json as Record<string, any>
    expect(j.warnings[0]).toContain("nope")
  })

  it("publishes the canonical URL key beside the id", () => {
    expect(soundIn("", "toggle.on").key).toBe("toggle-on")
  })
})

describe("resolved values, not just measurements", () => {
  it("returns the envelope and filter a consumer needs to judge an override", () => {
    const tap = soundIn("", "tap")
    expect(tap.envelopeMs).toEqual({
      attack: expect.any(Number),
      decay: expect.any(Number),
      sustain: expect.any(Number),
      release: expect.any(Number),
    })
    expect(tap.filter).toMatchObject({ type: expect.any(String), cutoffHz: expect.any(Number) })
  })

  it("separates the primary sweep from the span across all voices", () => {
    // Different quantities, previously conflated under one `range`, which is
    // what made the pair invariant below unverifiable. The span always CONTAINS
    // the primary sweep, and on a layered sound it is strictly wider — that
    // second part is the whole reason both fields exist.
    const all = (build("").json as any).sounds.filter((s: any) => s.pitchHz)
    let anyWider = false
    for (const s of all) {
      const lo = Math.min(s.pitchHz.start, s.pitchHz.end)
      const hi = Math.max(s.pitchHz.start, s.pitchHz.end)
      expect(s.frequencyHz.min, `${s.id} span should contain the sweep`).toBeLessThanOrEqual(lo)
      expect(s.frequencyHz.max, `${s.id} span should contain the sweep`).toBeGreaterThanOrEqual(
        hi,
      )
      if (s.frequencyHz.min < lo || s.frequencyHz.max > hi) anyWider = true
    }
    expect(anyWider, "at least one layered sound spans wider than its primary voice").toBe(true)
  })

  it("makes the pair inversion checkable from the payload alone", () => {
    // The published invariant: a pair traverses the same two notes in opposite
    // directions. That holds on pitchHz — never on frequencyHz, which spans
    // every layer and so differs whenever the two carry different voice counts.
    for (const [a, b] of [
      ["open", "close"],
      ["send", "receive"],
      ["toggle.on", "toggle.off"],
    ]) {
      const x = soundIn("", a).pitchHz
      const y = soundIn("", b).pitchHz
      const up = x.end / x.start
      const down = y.end / y.start
      expect(up * down, `${a}/${b} should traverse opposite directions`).toBeCloseTo(1, 1)
    }
  })

  it("rounds lengths to whole milliseconds", () => {
    for (const s of (build("").json as any).sounds) {
      expect(Number.isInteger(s.durationMs), `${s.id} durationMs`).toBe(true)
      expect(Number.isInteger(s.soundingMs), `${s.id} soundingMs`).toBe(true)
    }
  })
})

describe("the character line", () => {
  it("describes direction, interval and onset in one sentence", () => {
    const line = soundIn("", "success").character
    expect(line).toMatch(/^(Rises|Falls|Holds)\b/)
    expect(line).toMatch(/\d+ ms/)
    expect(line.endsWith(".")).toBe(true)
  })

  it("gives every sound one", () => {
    for (const s of (build("").json as any).sounds) {
      expect(typeof s.character, s.id).toBe("string")
      expect(s.character.length, s.id).toBeGreaterThan(10)
    }
  })
})
