// ==============================================
// EXPORT TESTS
// The markdown is the export this tool is judged on,
// and its value is entirely in what it SAYS — so
// these assert that the intent is present, not just
// that a string came back.
//
// A parameters-only markdown export would pass a
// naive "is it non-empty" test and be useless to the
// audience it exists for.
// ==============================================
import { describe, expect, it } from "vitest"
import { toAgentMarkdown, toJs, toJson, toNative } from "./export.js"
import { DEFAULT_CONFIG, resolve } from "./resolve.js"
import { PRESET_IDS } from "./presets.js"
import { SOUND_SPECS } from "./sounds.js"

const set = resolve(DEFAULT_CONFIG)
const URL_ = "https://beeps.studio/?p=soft"

describe("agent markdown", () => {
  const md = toAgentMarkdown(set, URL_)

  it("leads with the permalink", () => {
    expect(md.split("\n").slice(0, 5).join("\n")).toContain(URL_)
  })

  it("describes the character in words, not just numbers", () => {
    expect(md).toContain("**Character.**")
    expect(md).toMatch(/sine|square|triangle|sawtooth/)
  })

  it("carries every sound with both when and when-not", () => {
    for (const spec of SOUND_SPECS) {
      expect(md, spec.id).toContain(`\`${spec.id}\``)
      expect(md, `${spec.id} when`).toContain(spec.when)
      expect(md, `${spec.id} whenNot`).toContain(spec.whenNot)
    }
  })

  it("states the mute gate as a requirement, not a suggestion", () => {
    expect(md).toContain("default it to OFF")
    expect(md).toContain("Never autoplay")
    expect(md).toMatch(/This is not a\s+suggestion/)
  })

  it("explains the relationships well enough to add a twelfth sound", () => {
    expect(md).toContain("To add a twelfth sound")
    expect(md).toContain("Direction is meaning")
    expect(md).toContain("Pairs are inversions")
    // The trap: inverting success gives you notification.
    expect(md).toContain("NOT an inversion")
  })

  it("points at the code rather than an asset pipeline", () => {
    expect(md).toContain("there are no assets")
    expect(md).toContain("createBeeps")
  })

  it("documents the URL contract so an agent can construct one", () => {
    expect(md).toContain("## Changing this set")
    expect(md).toContain("?p=crisp")
    // The dotted-id gotcha has bitten before it could ship.
    expect(md).toContain("toggle-on")
  })

  it("lists the rest of the family", () => {
    expect(md).toContain("Other tools in this family")
    expect(md).toContain("Ramps")
    expect(md).toContain("Springs")
  })

  it("says up front when a link arrived broken", () => {
    const warned = toAgentMarkdown(set, URL_, ["Half of it went missing."])
    expect(warned.startsWith("> **This link did not arrive intact.**")).toBe(true)
    expect(warned).toContain("Half of it went missing.")
  })

  it("works for every preset", () => {
    for (const presetId of PRESET_IDS) {
      const out = toAgentMarkdown(resolve({ presetId, deltas: {} }), URL_)
      expect(out.length, presetId).toBeGreaterThan(3000)
    }
  })
})

describe("js export", () => {
  const js = toJs(set, URL_)

  it("ships the runtime source verbatim, not a regenerated copy", () => {
    // If this ever fails, someone has templated a second implementation and
    // the download has stopped matching the preview.
    expect(js).toContain("export function createBeeps")
    expect(js).toContain("export function scheduleSound")
    expect(js).toContain("linearRampToValueAtTime")
  })

  it("carries the set as data", () => {
    expect(js).toContain("export const SOUNDS")
    for (const spec of SOUND_SPECS) expect(js, spec.id).toContain(`"${spec.id}"`)
  })

  it("says how to use it, and that sound starts off", () => {
    expect(js).toContain("Sound is OFF until you call enable()")
    expect(js).toContain("user gesture")
  })

  it("is valid JavaScript", () => {
    // Parsed, not executed — the runtime needs a browser, but a syntax error
    // in the generated literal would ship silently otherwise.
    expect(() => new Function(js.replace(/^export /gm, ""))).not.toThrow()
  })
})

describe("json export", () => {
  const json = JSON.parse(toJson(set, URL_))

  it("is parseable and carries the envelope the family uses", () => {
    expect(json.$schema).toBeTruthy()
    expect(json.generator).toContain("Beeps")
    expect(json.source).toBe(URL_)
    expect(json.sounds).toHaveLength(11)
  })

  it("carries intent alongside the numbers", () => {
    for (const sound of json.sounds) {
      expect(sound.when, sound.id).toBeTruthy()
      expect(sound.whenNot, sound.id).toBeTruthy()
      expect(sound.normalizedGain, sound.id).toBeGreaterThan(0)
    }
  })

  it("states the mute gate in its notes", () => {
    expect(json.notes.join(" ")).toContain("mute gate")
  })
})

describe("native export", () => {
  const swift = toNative(set.sounds[0], URL_)

  it("defaults to off and uses the ambient session category", () => {
    expect(swift).toContain("isEnabled = false")
    expect(swift).toContain(".ambient")
  })

  it("names the sound it is for", () => {
    expect(swift).toContain(set.sounds[0].id)
  })
})
