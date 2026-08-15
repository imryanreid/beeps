// ==============================================
// CHARACTER PRESETS
// Nine of them, as plain data.
//
// A preset applies to the WHOLE set: base frequency,
// envelope shape, filter, noise, per-tier gain and
// envelope scaling — and its LAYERS, which are what
// make one preset sound like a different instrument
// rather than like the last one with the treble
// adjusted.
//
// Layers are the important part. Every sound in the
// set is defined semantically as one or two notes at
// musical intervals from the base; a preset expands
// each of those into a small stack — a detuned twin
// for warmth, an inharmonic partial for glass, a fifth
// for the sci-fi stack. Without them, Glassy is Soft
// with a brighter filter. With them, it is a struck
// rim.
//
// Nothing here is a code branch, and nothing anywhere
// branches on a preset id. A tenth preset is a tenth
// entry in PRESETS and nothing else.
//
// These numbers are a considered starting point.
// Presets are the highest-taste, lowest-code part of
// this product and they get finished by ear.
// ==============================================
import type { SpaceSpec, Tier, Waveform } from "./sounds.js"

export type PresetId =
  "soft" | "crisp" | "minimal" | "warm" | "bloopy" | "glassy" | "playful" | "retro" | "scifi"

/**
 * One voice a preset adds on top of each semantic note.
 *
 * The first layer is the note itself. Everything after it is colour: an
 * interval, a detune, or a longer tail. Layer gains are normalised at resolve
 * time so a three-layer preset is not three times louder than a one-layer one.
 */
export type PresetLayer = {
  /** Semitones from the semantic note. 0 is unison, 12 an octave up. */
  interval: number
  /**
   * Cents off, for beating. Two voices a few cents apart drift in and out of
   * phase, which is the whole of what "warm" means on a synthesizer.
   */
  detuneCents?: number
  waveform: Waveform
  /** Relative level within the stack, before normalisation. */
  gain: number
  /** Multiplier on decay and release. Above 1 makes this layer ring on. */
  tail?: number
  /**
   * Frequency modulation for this layer. See `FmSpec` in sounds.ts for what it
   * does, and why it is the one lever here that makes a new TIMBRE rather than
   * a new balance of existing ones.
   *
   * `ratio` is the modulator's frequency as a multiple of the note. Whole
   * numbers land the sidebands on harmonics and thicken the note; fractional
   * ones land them between harmonics and read as struck metal, wood or glass.
   * 3.5 is the classic bell.
   *
   * `index` is depth, as a multiple of the modulator's own frequency. Under 1
   * colours the tone; 2 to 5 is audibly a different instrument; past about 8 it
   * stops sounding pitched at all.
   *
   * `decay` is the share of the layer's own decay over which the depth falls
   * away, default 0.5. Below 1 the sound blooms bright and settles, which is
   * most of what makes FM read as a struck object rather than a buzz.
   */
  fm?: { ratio: number; index: number; decay?: number }
}

export type PresetDef = {
  id: PresetId
  name: string
  /** One line, shown in the dropdown. Say what it sounds like, not what it is. */
  blurb: string
  /** Where it belongs. Shown beside the blurb. */
  suits: string
  baseHz: number
  /** The stack every semantic note is expanded into. Never empty. */
  layers: PresetLayer[]
  /** The envelope shape. `envScale` stretches decay and release per tier. */
  attackMs: number
  decayMs: number
  sustain: number
  releaseMs: number
  /**
   * Multiplier on every declared semantic interval. Above 1 exaggerates the
   * rises and falls; below 1 flattens them. Never negative — a preset may not
   * reverse a sound's direction, because direction is meaning.
   */
  sweepScale: number
  /**
   * The downward glide given to a note that declares no interval of its own,
   * in semitones. This is what gives an otherwise steady note its character.
   */
  intrinsicSweep: number
  /** Share of decay + release that the pitch glide occupies, 0–1. */
  sweepShare: number
  /**
   * How the pitch travels. `stepped` moves in discrete jumps instead of
   * sliding — chiptune hardware had no portamento, and imitating that
   * limitation is most of what makes a retro sound read as retro.
   */
  glide: "smooth" | "stepped"
  filterType: "lowpass" | "highpass"
  filterCutoffHz: number
  filterQ: number
  /** Null on presets with no noise layer. */
  noise: { amount: number; decayMs: number } | null
  /**
   * The room. Null on presets that are meant to be dry.
   *
   * See `SpaceSpec` in sounds.ts. Its tail counts against DURATION_BUDGET, so
   * a preset can only carry as much room as its envelope leaves headroom for —
   * which is why the longest presets here are the driest.
   */
  space?: SpaceSpec | null
  /** Peak amplitude per tier, before loudness normalization. */
  gain: Record<Tier, number>
  /**
   * How much the tier stretches decay and release. Attack is left alone — it
   * is character, and stretching it would just make an alert mushy.
   *
   * Every preset is written so `notable` is 1.0 — the tier's decay and release
   * ARE the preset's, and subtle and alert scale around it. That makes the
   * numbers above readable as the sound's real shape rather than as a base
   * nobody hears.
   *
   * The ceiling is set by the two-note sounds: `notification` starts its second
   * note 40% in, so its total runs about 1.4x the envelope — more where a layer
   * has a `tail`. See DURATION_BUDGET.
   */
  envScale: Record<Tier, number>
}

/** A single unison voice — the stack for presets that want no colour. */
const solo = (waveform: Waveform): PresetLayer[] => [{ interval: 0, waveform, gain: 1 }]

export const PRESETS: Record<PresetId, PresetDef> = {
  soft: {
    id: "soft",
    name: "Soft",
    blurb: "Rounded, low, unhurried. Nothing sharp, so it survives being heard all day.",
    // Was "the safe default", which stopped being true when warm took the
    // default. It is still the most neutral thing here — which is what makes it
    // the best base to edit from, and the reason it is not the first thing a
    // visitor hears.
    suits: "the neutral base to build from",
    // 720 Hz rather than 880: warmer, and still high enough that `delete`'s
    // octave drop lands near 360 Hz instead of inside the small-speaker
    // rolloff.
    baseHz: 720,
    layers: solo("sine"),
    attackMs: 8,
    decayMs: 150,
    sustain: 0,
    releaseMs: 75,
    sweepScale: 0.8,
    intrinsicSweep: 1.5,
    sweepShare: 0.3,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 1400,
    filterQ: 0.7,
    noise: null,
    gain: { subtle: 0.18, notable: 0.3, alert: 0.4 },
    envScale: { subtle: 0.46, notable: 1.0, alert: 1.65 },
  },

  minimal: {
    id: "minimal",
    name: "Minimal",
    blurb: "You notice it missing, not present. About a third of Soft's loudness.",
    suits: "tools people live in all day",
    // 900, not the round 1000: at 1000 the top note of `notification` lands at
    // 2119 Hz, over the harsh-band line.
    baseHz: 900,
    layers: solo("triangle"),
    attackMs: 2,
    decayMs: 106,
    sustain: 0,
    releaseMs: 42,
    // 0.7, not 0.5. Restraint here is a matter of level — a tenth of Soft's
    // gain — not of holding still, and at 0.5 every contour compressed far
    // enough that `close` and `tap` became the same falling sound.
    sweepScale: 0.7,
    intrinsicSweep: 1,
    sweepShare: 0.22,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 2200,
    filterQ: 0.5,
    noise: null,
    gain: { subtle: 0.08, notable: 0.13, alert: 0.18 },
    envScale: { subtle: 0.5, notable: 1.0, alert: 1.6 },
  },

  crisp: {
    id: "crisp",
    name: "Crisp",
    blurb: "A click, not a beep. A 1 ms attack, a noise transient, and almost no tail.",
    suits: "dense, fast interfaces",
    baseHz: 880,
    layers: solo("square"),
    attackMs: 1,
    decayMs: 84,
    sustain: 0,
    releaseMs: 15,
    sweepScale: 1.3,
    // 2, not 3. `notification`'s top note sits at +12, and an intrinsic glide
    // of 3 starts it at 880 x 2^(15/12) = 2093 Hz — inside the harsh band.
    intrinsicSweep: 2,
    sweepShare: 0.14,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 5000,
    filterQ: 1.2,
    // 6 ms, so it does most of its work before the oscillator reaches full
    // amplitude. That ordering is what reads as a physical click.
    noise: { amount: 0.25, decayMs: 6 },
    gain: { subtle: 0.22, notable: 0.35, alert: 0.45 },
    envScale: { subtle: 0.74, notable: 1.0, alert: 1.68 },
  },

  warm: {
    id: "warm",
    name: "Warm",
    blurb: "Three sines a few cents apart, beating audibly against each other. Dark and full.",
    suits: "finance, health, anything that should feel steady",
    baseHz: 680,
    // Three sines, spread 24 cents from lowest to highest. Beating is what
    // "warm" means on a synthesizer, but the rate has to fit the sound: a
    // single twin 9 cents out beat at 3.5 Hz, one cycle every 285 ms, so at a
    // 132 ms `tap` you heard less than half a cycle — no beating at all, just a
    // fractionally thicker tone. Twelve cents either side beats near 9.4 Hz,
    // which is nearly three cycles inside a 290 ms sound and audible as
    // movement.
    //
    // No octave layer. Warmth is darkness, and shine works against it — the
    // body comes from the three unisons under a low cutoff instead.
    layers: [
      {
        interval: 0,
        waveform: "sine",
        gain: 1,
        // Unison ratio, so sidebands land on the note's own harmonics and read
        // as body rather than as a different instrument.
        fm: { ratio: 1, index: 0.7, decay: 0.9 },
      },
      { interval: 0, detuneCents: 12, waveform: "sine", gain: 0.9 },
      { interval: 0, detuneCents: -12, waveform: "sine", gain: 0.9 },
    ],
    attackMs: 14,
    decayMs: 174,
    sustain: 0,
    releaseMs: 102,
    sweepScale: 0.65,
    intrinsicSweep: 1.2,
    sweepShare: 0.34,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 820,
    filterQ: 0.5,
    noise: null,
    gain: { subtle: 0.2, notable: 0.32, alert: 0.42 },
    envScale: { subtle: 0.42, notable: 1.0, alert: 1.5 },
  },

  bloopy: {
    id: "bloopy",
    name: "Bloopy",
    blurb: "Round, wet and unhurried — a drop into water. Deep glide, almost no edge.",
    suits: "therapy, meditation, anything that should slow you down",
    baseHz: 700,
    layers: [
      {
        interval: 0,
        waveform: "sine",
        gain: 1,
        // Half the note's frequency, putting sidebands BELOW it as well as
        // above — the underwater weight this preset is named for.
        fm: { ratio: 0.5, index: 1.6, decay: 0.7 },
      },
      { interval: 12, waveform: "sine", gain: 0.18, tail: 0.7 },
    ],
    attackMs: 8,
    decayMs: 193,
    sustain: 0,
    releaseMs: 129,
    // A deep, slow glide on a sine through a low resonant filter is the whole
    // "bloop". The resonance does real work here — at Q 0.7 this is just a soft
    // tone; at 3.5 the filter rings enough to give the drop a body.
    sweepScale: 1.4,
    intrinsicSweep: 4,
    sweepShare: 0.42,
    glide: "smooth",
    filterType: "lowpass",
    // 1000, not 720. The old cutoff sat essentially ON the fundamental —
    // 700 Hz base against a 720 Hz cutoff — so the filter was attenuating
    // the note itself rather than what sits above it. That is the mud.
    filterCutoffHz: 1000,
    filterQ: 3.5,
    noise: null,
    gain: { subtle: 0.2, notable: 0.3, alert: 0.38 },
    envScale: { subtle: 0.38, notable: 1.0, alert: 1.35 },
  },

  glassy: {
    id: "glassy",
    name: "Glassy",
    blurb: "A struck rim. Almost a pure tone, ringing longer than anything else here.",
    suits: "premium, editorial, anything unhurried",
    // 880. High enough to be bright on its own — most of what reads as "clear"
    // here is the pitch, not the spectrum, because there is barely any spectrum.
    baseHz: 880,
    // Glass is nearly a sine, and that is the whole point of it.
    //
    // The version of this preset that used to be called Glassy had a partial a
    // twelfth up — exactly 3x the fundamental — which is how a xylophone bar is
    // tuned, and it read as one no matter how the strength and length were
    // adjusted. A struck rim does the opposite: its modes are INHARMONIC and
    // weak, sitting at rough ratios of 2.3x and 4.2x rather than on any
    // interval, so they colour the note instead of harmonising with it.
    //
    // 14.5 semitones is 2.32x — not a musical interval, which is deliberate:
    // anything landing on one starts sounding like a second note. At this gain
    // it is air, not a note. A second partial at 26 was tried and dropped; it
    // put `notification`'s top note at 8874 Hz, over the 6 kHz ceiling, and one
    // dominant mode is closer to real glass regardless.
    //
    // Its tail is BELOW 1 so it fades before the note. Length belongs in the
    // fundamental here — a partial that outlives the note is the bell this
    // preset spent three rounds escaping.
    layers: [
      {
        interval: 0,
        waveform: "sine",
        gain: 1,
        // 3.5 is the classic bell ratio — sidebands land BETWEEN harmonics,
        // which is what struck glass and struck metal have in common, and what
        // no arrangement of additive partials could reach.
        fm: { ratio: 3.5, index: 1.4, decay: 0.3 },
      },
      { interval: 14.5, waveform: "sine", gain: 0.075, tail: 0.9 },
    ],
    // Fast enough to be struck, not so fast it clicks. 2 ms is 1.8 cycles at
    // this base. What matters is not the millisecond figure but how many CYCLES
    // of its own note the onset covers: a struck object reaches full amplitude
    // inside one, and at 6 ms this preset was taking four to ten depending on
    // the note, which reads as a swell rather than a strike.
    attackMs: 2,
    // The longest envelope in the set, and the identity of the preset. Glass
    // rings; that is what it does. This is as long as the duration budget
    // allows — `send` and `receive` carry a 1.3 length scale on top, which puts
    // them at 418 ms against the notable ceiling of 450.
    decayMs: 185,
    sustain: 0,
    releaseMs: 135,
    // Barely swoops. A struck rim holds its pitch, and with this much ring time
    // a glide would be the most obvious thing in the sound.
    sweepScale: 0.65,
    intrinsicSweep: 0.4,
    sweepShare: 0.12,
    glide: "smooth",
    filterType: "lowpass",
    // Wide open, and it does very little — three sines have nothing above them
    // to remove. It is here to keep the top partial from getting glassy in the
    // wrong sense on bright playback.
    filterCutoffHz: 9000,
    filterQ: 0.5,
    noise: null,
    gain: { subtle: 0.15, notable: 0.24, alert: 0.32 },
    envScale: { subtle: 0.4, notable: 1.0, alert: 1.5 },
  },

  playful: {
    id: "playful",
    name: "Playful",
    blurb: "Bouncy and bright, with exaggerated leaps. A square edge over a soft core.",
    suits: "games, kids' apps, anything that rewards you",
    baseHz: 800,
    layers: [
      {
        interval: 0,
        waveform: "triangle",
        gain: 1,
        // An octave up, harmonically, so it brightens the attack and falls
        // away — bouncy rather than metallic.
        fm: { ratio: 2, index: 1.6, decay: 0.35 },
      },
      { interval: 12, waveform: "square", gain: 0.22 },
    ],
    attackMs: 2,
    decayMs: 134,
    sustain: 0,
    releaseMs: 34,
    // The leaps are the joke. Everything the set says rises or falls, this says
    // twice as hard — without ever reversing a direction, because direction is
    // meaning even when the tone is silly.
    sweepScale: 1.4,
    intrinsicSweep: 3,
    sweepShare: 0.2,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 3200,
    filterQ: 1.5,
    noise: null,
    // The longest delay of the three, with the LEAST feedback: long enough
    // that you hear the repeat as a discrete bounce rather than as ambience,
    // and shallow enough that it bounces once and stops.
    space: { delayMs: 30, feedback: 0.18, mix: 0.34, dampingHz: 5000 },
    gain: { subtle: 0.22, notable: 0.34, alert: 0.44 },
    envScale: { subtle: 0.45, notable: 1.0, alert: 1.6 },
  },

  retro: {
    id: "retro",
    name: "Retro",
    blurb: "Chiptune. Square waves, an octave stacked on top, and pitch that jumps in steps.",
    suits: "games, dev tools, anything with a sense of humour",
    baseHz: 880,
    layers: [
      { interval: 0, waveform: "square", gain: 1 },
      { interval: 12, waveform: "square", gain: 0.32 },
    ],
    attackMs: 1,
    decayMs: 95,
    sustain: 0,
    releaseMs: 14,
    sweepScale: 1.4,
    intrinsicSweep: 2,
    sweepShare: 0.16,
    // The one preset that does not slide. Chiptune hardware had no portamento —
    // pitch was written to a register, so it jumped — and imitating that
    // limitation is most of what makes this read as retro rather than as a
    // square wave with a swoop.
    glide: "stepped",
    filterType: "lowpass",
    filterCutoffHz: 6000,
    filterQ: 0.5,
    noise: { amount: 0.15, decayMs: 12 },
    // The shortest delay and the most feedback, with almost no damping — it
    // sits right against your ear and stays bright the whole way down. A chip
    // delay line, not a room.
    space: { delayMs: 11, feedback: 0.34, mix: 0.3, dampingHz: 9000 },
    gain: { subtle: 0.2, notable: 0.3, alert: 0.4 },
    envScale: { subtle: 0.66, notable: 1.0, alert: 1.7 },
  },

  scifi: {
    id: "scifi",
    name: "Sci-Fi",
    blurb: "Zaps. A modulated core under a sawtooth fifth, plunging through a resonant filter.",
    suits: "games, dashboards, anything that wants to feel like a console",
    baseHz: 820,
    layers: [
      {
        interval: 0,
        waveform: "sine",
        gain: 1,
        // A SINE carrier, which is not a detail — it is the whole reason this
        // stopped being crunchy. FM's clean sideband structure assumes one: a
        // sawtooth already contains every harmonic, so each one spawns its own
        // sideband family and they intermodulate into noise rather than into a
        // timbre. Measured on `tap`, flatness ran 0.251 for the dry saw and
        // 0.450 with FM on top of it — most of the way to white noise, and
        // exactly the "crunchy and bleh" it sounded like. The same index on a
        // sine reads 0.212: rich, metallic, still a tone. The sawtooth fifth
        // below is where the buzz lives now.
        fm: { ratio: 2.4, index: 4, decay: 0.55 },
      },
      { interval: 7, waveform: "sawtooth", gain: 0.4 },
    ],
    attackMs: 1,
    decayMs: 157,
    sustain: 0,
    releaseMs: 32,
    // Three times the declared interval, travelled fast. A `delete` that
    // normally falls an octave here starts two octaves up and plunges. The
    // sweep passes THROUGH the harsh band rather than sitting in it — which is
    // exactly what a zap is, and why the frequency rule is about where a sound
    // lands, not everywhere it has been.
    sweepScale: 1.4,
    intrinsicSweep: 6,
    sweepShare: 0.1,
    glide: "smooth",
    filterType: "lowpass",
    filterCutoffHz: 3000,
    // High Q so the filter itself rings as the pitch drops past it. That
    // resonant sweep is what reads as "energy weapon" rather than "buzz".
    filterQ: 8.0,
    noise: { amount: 0.2, decayMs: 10 },
    // The wettest and by far the darkest: 1400 Hz of damping puts it at a
    // distance, where Retro's 9000 sits against your ear. Same mechanism,
    // opposite end of every parameter.
    //
    // All three rooms are sized by the SUBTLE tier, which is what binds —
    // `open` is barely 100 ms dry, so its tail cannot be much longer again.
    // That is also why no calm preset has one: Soft, Warm, Bloopy and Glassy
    // are the long ones, and a long sound leaves no budget for a tail. Rooms
    // cluster on the lively end for a structural reason, not a stylistic one,
    // which is why they have to differ hard from each other.
    space: { delayMs: 22, feedback: 0.22, mix: 0.42, dampingHz: 1400 },
    // Lower than the others on purpose. A 0.42 wet mix stacks the room's
    // energy on top of the dry signal, and at the old levels the raw render
    // reached 0.997 before normalization had a chance to act — no headroom
    // left for it to work with.
    gain: { subtle: 0.16, notable: 0.26, alert: 0.34 },
    envScale: { subtle: 0.45, notable: 1.0, alert: 1.7 },
  },
}

/**
 * The default leads; the rest run restrained → expressive.
 *
 * `warm` is first and is the default because it is the one that sounds most
 * like a finished product straight away — the set someone would ship without
 * touching. `soft` is the quieter, more neutral starting point, which is a
 * better *base to edit from* than a first impression: a near-sine set is the
 * hardest to tell apart from no character at all, and the landing page has one
 * chance to demonstrate that this tool makes sounds worth using.
 */
export const PRESET_IDS: PresetId[] = [
  "warm",
  "soft",
  "minimal",
  "crisp",
  "bloopy",
  "glassy",
  "playful",
  "retro",
  "scifi",
]

/**
 * Changing this changes what a bare `beeps.studio/` returns, which is a public
 * surface — the `p` table in `public/llms.txt` and the parameter block in
 * `src/lib/export.ts` both name the default and must move with it.
 */
export const DEFAULT_PRESET: PresetId = "warm"

export function isPresetId(v: string): v is PresetId {
  return Object.prototype.hasOwnProperty.call(PRESETS, v)
}
