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

  it("gives length a floor as well as a ceiling", () => {
    // The floor is the half people miss — they read a quiet sound as a volume
    // problem when it is a duration problem.
    expect(md).toContain("floor as well as a ceiling")
    expect(md).toMatch(/integrates loudness/)
    expect(md).toContain("turning it up will not fix it")
  })

  it("tells a web app not to play into a backgrounded tab", () => {
    expect(md).toContain("visibilityState")
  })

  it("says which frequency zone bites on which platform", () => {
    // Desktop and web users are often on headphones, which reproduce the harsh
    // band faithfully and make the low floor much less binding. The weighting
    // flips, and saying so is more useful than listing both flatly.
    expect(md).toContain("Small-speaker floor")
    expect(md).toContain("bites on desktop")
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

  it("compiles for macOS, which is a primary target", () => {
    // AVAudioSession does not exist on macOS — an unguarded call does not
    // compile for a Mac target at all. This shipped broken for exactly the
    // platform the tool is aimed at.
    expect(swift).toContain("#if os(iOS)")
    expect(swift).toContain("#endif")
    const guarded = swift.slice(swift.indexOf("#if os(iOS)"), swift.indexOf("#endif"))
    expect(guarded).toContain("AVAudioSession")
  })

  it("names the sound it is for", () => {
    expect(swift).toContain(set.sounds[0].id)
  })
})

// ---------------------------------------------------------------------------
// Parity with the fetchable payload
//
// The markdown is the export a HUMAN is most likely to paste into an agent's
// context, and it was the weakest surface this tool has: it stated the budget
// rules but never whether this set broke them, and it could not tell an edited
// set from a stock one. Both were already fixed in /api/sounds; these keep the
// two from drifting apart again.
// ---------------------------------------------------------------------------

describe("the markdown reports what the set actually is", () => {
  it("flags a sound past its tier ceiling, with the number and the fix", () => {
    const long = resolve({ presetId: "soft", deltas: { tap: { decayMs: 700, releaseMs: 300 } } })
    const md = toAgentMarkdown(long, URL_)
    expect(md).toContain("## Budget check")
    expect(md).toMatch(/`tap` is \d+ ms, past the 180 ms ceiling/)
    expect(md).toContain("Shorten it")
  })

  it("says so plainly when nothing is out of budget", () => {
    const md = toAgentMarkdown(set, URL_)
    expect(md).toContain("All eleven sounds sit inside their tier's length budget.")
  })

  it("marks which sounds the link edited, and which it re-voiced", () => {
    const config = {
      presetId: "soft" as const,
      deltas: { send: { attackMs: 4 } },
      presets: { tap: "bloopy" as const },
    }
    const md = toAgentMarkdown(resolve(config), URL_, [], config)

    const row = (id: string) => md.split("\n").find((l) => l.startsWith(`| \`${id}\``))!
    expect(row("send")).toContain("attackMs")
    expect(row("tap")).toContain("voice: bloopy")
    // An untouched sound is explicitly marked as such, not left blank.
    expect(row("error")).toContain("—")
  })

  it("leaves the Edited column dashed throughout when given no config", () => {
    // The parameter is optional; without it the export must not imply edits.
    const md = toAgentMarkdown(set, URL_)
    for (const spec of SOUND_SPECS) {
      const row = md.split("\n").find((l) => l.startsWith(`| \`${spec.id}\``))!
      expect(row, spec.id).toContain("—")
    }
  })

  it("describes how every sound behaves, in words", () => {
    const md = toAgentMarkdown(set, URL_)
    expect(md).toContain("## How each sound behaves")
    for (const spec of SOUND_SPECS) {
      expect(md, spec.id).toContain(`- \`${spec.id}\` —`)
    }
  })
})

describe("the interval column", () => {
  it("does not repeat one note once per oscillator", () => {
    // Warm stacks three detuned sines: one note, three voices. That used to
    // print as "+1 → +0, then +1 → +0, then +1 → +0".
    const warm = resolve({ presetId: "warm", deltas: {} })
    const md = toAgentMarkdown(warm, URL_)
    const row = md.split("\n").find((l) => l.startsWith("| `tap`"))!
    const interval = row.split("|")[4].trim()
    expect(interval).not.toContain("then")
    expect(interval.match(/→/g)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it("never prints the same interval twice in one cell", () => {
    // `success` is a note plus a detuned stack arriving together a moment
    // later; those three used to print as three separate "then" events.
    const warm = resolve({ presetId: "warm", deltas: {} })
    const md = toAgentMarkdown(warm, URL_)
    for (const l of md.split("\n").filter((x) => x.startsWith("| `"))) {
      const cell = l.split("|")[4].trim()
      const labels = cell.split(/,\s*then\s*|\s*\+\s*/).map((x) => x.trim()).filter(Boolean)
      expect(new Set(labels).size, cell).toBe(labels.length)
    }
  })

  it("still says 'then' for a voice that genuinely arrives later", () => {
    // notification is a two-note ding — the second note is offset, so the
    // sequence is real and must survive the deduplication above.
    const warm = resolve({ presetId: "warm", deltas: {} })
    const offsets = warm.sounds
      .find((s) => s.id === "notification")!
      .voices.filter((v) => v.startOffsetMs > 0)
    const row = toAgentMarkdown(warm, URL_)
      .split("\n")
      .find((l) => l.startsWith("| `notification`"))!
    if (offsets.length) expect(row).toContain("then")
  })
})
