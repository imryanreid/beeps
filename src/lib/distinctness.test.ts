// ==============================================
// DISTINCTNESS
// No two sounds in the set may be the same sound.
//
// This file exists because they were. `expand` and
// `scoopUp` returned identical notes from identical
// inputs — four shape names, two behaviours — so
// `open` was `toggle.on` transposed three semitones,
// in every preset, and `close` was `toggle.off`.
// `receive` and `delete` shared a shape, a travel, a
// tier and a length while sitting three semitones
// apart. `tap` and `error` were both flat on the same
// note and differed only in harshness, which a sine
// exposes and a square hides.
//
// None of it failed a build and none of it failed a
// test. It failed by ear, on the presets whose
// character suppresses whichever cue was carrying the
// difference — which is the worst way to find out,
// because it looks like a preset problem and gets
// patched one preset at a time.
// ==============================================
import { describe, expect, it } from "vitest"
import { PRESET_IDS } from "./presets.js"
import { SOUND_SPECS, notesFor, type Shape, type Sound } from "./sounds.js"
import { MAX_GLIDE_SEMITONES, resolve } from "./resolve.js"

const SHAPES: Shape[] = [
  "flat",
  "ding",
  "ascend",
  "descend",
  "scoopUp",
  "scoopDown",
  "expand",
  "collapse",
]

/** The note-carrying voices, in order. Layers above 0 are colour, not identity. */
const notesOf = (s: Sound) =>
  s.voices.filter((v): v is Extract<typeof v, { kind: "osc" }> => v.kind === "osc" && v.layer === 0)

/** Where the sound's energy sits, in semitones from base. */
function centreSemitones(s: Sound, baseHz: number) {
  const notes = notesOf(s)
  const weight = notes.reduce((n, v) => n + v.gain, 0) || 1
  const sum = notes.reduce(
    (n, v) => n + Math.log2(Math.sqrt(v.pitch.startHz * v.pitch.endHz) / baseHz) * 12 * v.gain,
    0,
  )
  return sum / weight
}

/**
 * The whole contour: first note's onset to last note's landing.
 *
 * Unless the notes are simultaneous, in which case there is no contour to
 * measure — a `ding` strikes its fundamental and its fifth together, and
 * reading the span between them as a glide claimed `notification` rose seven
 * semitones when it does not move at all.
 */
function travelSemitones(s: Sound) {
  const notes = notesOf(s)
  if (!notes.length) return 0
  const struckTogether = notes.every((v) => v.startOffsetMs === notes[0].startOffsetMs)
  const last = struckTogether ? notes[0] : notes[notes.length - 1]
  return Math.log2(last.pitch.endHz / notes[0].pitch.startHz) * 12
}

const glideMs = (s: Sound) => notesOf(s)[0]?.pitch.sweepMs ?? 0

describe("the shape vocabulary", () => {
  it("gives every shape its own behaviour", () => {
    // The bug this whole file is named after. `expand` shared a switch branch
    // with `scoopUp` and `collapse` with `scoopDown`, so two of the eight
    // shapes were aliases and nothing said so. A shape that cannot produce a
    // different sound from another shape is not a shape, it is a synonym — and
    // the sounds built on it are duplicates by construction.
    const seen = new Map<string, Shape>()
    for (const shape of SHAPES) {
      const notes = notesFor(shape, 0, 6)
      const glide = glideShareOf(shape)
      const fingerprint = JSON.stringify({ notes, glide })
      const clash = seen.get(fingerprint)
      expect(clash, `${shape} is indistinguishable from ${clash}`).toBeUndefined()
      seen.set(fingerprint, shape)
    }
  })

  it("mirrors every up shape with a down shape", () => {
    // Direction is meaning, so each rising shape needs an exact opposite for
    // its pair to invert by construction rather than by hand-authoring.
    for (const [up, down] of [
      ["scoopUp", "scoopDown"],
      ["expand", "collapse"],
      ["ascend", "descend"],
    ] as const) {
      const flat = (shape: Shape) => notesFor(shape, 0, 6).flatMap((n) => [n.from, n.to])
      expect(flat(down), `${up}/${down}`).toEqual(flat(up).reverse())
      // ...and mirrored shapes must still glide alike, or the pair reads as
      // two different gestures that happen to point opposite ways.
      expect(glideShareOf(down), `${up}/${down} glide`).toBe(glideShareOf(up))
    }
  })
})

describe("the glide cap", () => {
  it("is a backstop no preset actually reaches", () => {
    // Clipping is order-destroying: two sounds that ask for different travels
    // and both get clipped come out with the SAME travel. At 18 that made
    // `close` and `delete` identical on Sci-Fi. So the cap has to sit above
    // every preset's real reach, and a preset that grows into it needs its own
    // sweepScale brought down rather than this raised.
    for (const presetId of PRESET_IDS) {
      const set = resolve({ presetId, deltas: {} })
      for (const sound of set.sounds) {
        for (const v of notesOf(sound)) {
          const semis = Math.abs(Math.log2(v.pitch.endHz / v.pitch.startHz) * 12)
          expect(semis, `${presetId}/${sound.id} reaches the cap`).toBeLessThan(
            MAX_GLIDE_SEMITONES,
          )
        }
      }
    }
  })
})

describe("no two sounds are the same sound", () => {
  // A sound is distinguishable from another if it differs in at least ONE of
  // these. Any single one is enough; what went wrong was sounds that matched
  // on all four and were left to be told apart by loudness and length, which
  // do not confer identity — a longer, louder copy of `tap` is still `tap`.
  const PITCH_SEMITONES = 3
  const TRAVEL_SEMITONES = 3
  const GLIDE_RATIO = 2
  /**
   * A glide only counts as a difference if it is long enough to be heard AS a
   * glide. Below this it is a pitch jump, and one jump sounds like another.
   *
   * Without this floor the ratio was comparing negligible numbers: on Glassy,
   * `open` and `toggle.on` glide for 26 ms and 7 ms, which is 3.67x and passed
   * — while both are far too short to perceive, so the only real cue left was
   * a 1-semitone difference in where they started. They landed on the same
   * note and sounded like one sound.
   */
  const GLIDE_AUDIBLE_MS = 25

  for (const presetId of PRESET_IDS) {
    it(presetId, () => {
      const set = resolve({ presetId, deltas: {} })
      const info = SOUND_SPECS.map((spec) => {
        const s = set.sounds.find((x) => x.id === spec.id)!
        return {
          id: spec.id,
          centre: centreSemitones(s, set.baseHz),
          travel: travelSemitones(s),
          glide: glideMs(s),
        }
      })

      const clashes: string[] = []
      for (let i = 0; i < info.length; i++) {
        for (let j = i + 1; j < info.length; j++) {
          const a = info[i]
          const b = info[j]
          const pitch = Math.abs(a.centre - b.centre) >= PITCH_SEMITONES
          const direction = Math.sign(a.travel) !== Math.sign(b.travel)
          const travel = Math.abs(a.travel - b.travel) >= TRAVEL_SEMITONES
          const glide =
            Math.max(a.glide, b.glide) >= GLIDE_AUDIBLE_MS &&
            Math.max(a.glide, b.glide) / Math.max(1, Math.min(a.glide, b.glide)) >= GLIDE_RATIO
          if (!pitch && !direction && !travel && !glide)
            clashes.push(
              `${a.id}/${b.id}: ${Math.abs(a.centre - b.centre).toFixed(1)}st apart, ` +
                `travel ${a.travel.toFixed(1)}/${b.travel.toFixed(1)}, ` +
                `glide ${a.glide.toFixed(0)}/${b.glide.toFixed(0)}ms`,
            )
        }
      }
      expect(clashes, `indistinguishable on ${presetId}`).toEqual([])
    })
  }
})

/** Kept local so the test states the rule rather than importing its own answer. */
function glideShareOf(shape: Shape): number {
  switch (shape) {
    case "scoopUp":
    case "scoopDown":
      return 0.5
    case "expand":
    case "collapse":
      return 1.5
    default:
      return 1
  }
}
