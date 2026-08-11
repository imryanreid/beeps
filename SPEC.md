# SPEC — Beeps

> **What this file is for:** What the tool is, what it generates, and why each
> decision went the way it did. The contract the build is measured against. Not
> a file inventory — see [`PROJECT_MAP.md`](PROJECT_MAP.md) once it exists — and
> not a session log, which is [`NEXT-UP.md`](NEXT-UP.md). For the family's
> visual language see
> [`DESIGN-LANGUAGE.md`](../Ramps%20Studio/DESIGN-LANGUAGE.md); for how to work
> in this repo see [`CLAUDE.md`](CLAUDE.md).

Third tool in the **Studio Tools** family, after
[Ramps](../Ramps%20Studio) and [Motion](../Motion%20Studio). Ships at
**beeps.studio**. Listed in the manifest as **Beeps — "UI sounds & feedback"**.

---

## 1. The thesis

UI sound is the least systematized feedback layer in software. Color has ramps
and tokens. Motion has curves and durations. Sound has a folder of MP3s someone
downloaded once, at inconsistent volumes, with no rule about which one plays
when.

Coding agents have it worse: they cannot specify sound at all. An agent asked to
"add a success sound" has no vocabulary, no defaults, and no way to hear what it
produced. It reaches for an asset it cannot evaluate, or it does nothing.

Beeps generates a coherent, restrained set of interface sounds and exports them
in a form both humans and agents can use. Two commitments follow from that, and
everything else in this document is downstream of them:

**Everything is synthesized in the browser.** Oscillators, envelopes, filters,
and a noise source. No sample library, no hosted audio, no licensing, no CDN.
A sound is a few dozen numbers, which is why it can live in a URL and why an
agent can reason about it.

**The markdown export carries intent, not just parameters.** An agent cannot
hear a WAV. Every other tool in this family exports values an agent uses
directly; here the values alone are useless. So the markdown says when to play
what, in plain language, and ships the synthesis function so the agent writes
code rather than managing an asset pipeline.

---

## 2. Scope

**v1 ships:** the synth core; three character presets; the eleven-sound set;
the semantic derivation system (intervals, pairs, tiers); loudness
normalization; the preview surfaces including rapid-fire; URL state; and five
export formats — WAV, base64 data URI, a JS synthesis function, JSON params,
and agent markdown. Plus the native pair (WAV + an `AVAudioPlayer` snippet).

**Shipped beyond the original v1 line.** Preset _layers_ — a preset
contributing its own voices on top of each semantic note — landed early,
because without them every preset is the same synth with the filter moved and
the whole "character" idea collapses. That unlocked nine presets rather than
three: Soft, Minimal, Crisp, Warm, Bloopy, Glassy, Playful, Retro and Sci-Fi.

**Deferred to v2**: A/B compare between two presets; a zip of the full set;
suggested haptic mappings; a filter envelope.

**Out of scope entirely:** MP3, AAC and MP4 export (§12); recording or importing
audio; anything with a backend, an account, or a stored file.

§17 states which v1 decisions would make a v2 item expensive, and what the build
does about each.

---

## 3. The sound model

A **sound** is a list of voices summed into a master gain, through one filter,
with a resolved output level. That is the whole model.

```ts
type Waveform = "sine" | "triangle" | "square" | "sawtooth"

type Envelope = {
  attackMs: number // 0–200. Must reach single digits — see §4.2
  decayMs: number
  sustain: number // 0–1, a level not a time
  releaseMs: number
}

type PitchEnvelope = {
  startHz: number
  endHz: number
  sweepMs: number // may be shorter than the sound; then it holds at endHz
}

type Voice =
  | {
      kind: "osc"
      waveform: Waveform
      pitch: PitchEnvelope
      env: Envelope
      gain: number
      /** Semitones offset from this voice's pitch. Lets one voice describe a
          harmonic partner without a second pitch envelope. */
      detuneSemitones: number
      /** Delay from the sound's t0. Two-note sounds are two voices, not a
          special case. */
      startOffsetMs: number
    }
  | {
      kind: "noise"
      env: Envelope
      gain: number
      startOffsetMs: number
    }

type Filter = {
  type: "lowpass" | "highpass"
  cutoffHz: number
  q: number // resonance, 0.0001–20
}

type Sound = {
  id: SoundId
  voices: Voice[] // summed. Never assumed to be length 1 or 2
  filter: Filter
  durationMs: number
  tier: "subtle" | "notable" | "alert"
  /** Computed by §8, not authored. Live playback, the WAV render and the JS
      export all read this same number. */
  normalizedGain: number
}
```

Three things about this shape are load-bearing.

**`voices` is a list, always.** The brief's v2 item — a second oscillator at an
octave or a fifth — is `voices.push(...)`, not a branch. v1 already exercises
this: `success` and `notification` are two-voice sounds, so the summing path is
covered by the shipped set rather than sitting untested until v2 needs it.

**The envelope is the master, and duration follows it.** `durationMs` is
computed as `attack + decay + release`, never authored.

This started the other way round — duration authored, envelope squeezed to fit —
and it made the editor unusable. Dragging the attack rescaled all three
segments, so the slider settled somewhere you had not chosen and decay and
release moved on their own. You were fighting the fitter rather than editing a
sound. It is also the more honest model: a percussive one-shot is over when it
has decayed, and a "duration" that could not change what you heard was a
control doing nothing.

Tiers express length through `envScale`, which stretches decay and release —
never the attack, which is character rather than duration. UI sounds are
one-shots, so `sustain` is 0 across every shipped preset and the release shapes
the tail; full ADSR is kept because the brief asks for it and a future preset
may want a hold.

One consequence worth stating: the **two-note sounds set the ceiling**.
`notification` starts its second note 40% in, so its total runs about 1.4x the
envelope — more where a layer has a `tail`. A shipped default must never trip
this tool's own warning, and a test enforces it at both ends.

**`normalizedGain` is computed once and read everywhere.** See §8 and §15.

---

## 4. The synth core

### 4.1 The signal chain

```
   voice[0] ─ osc ──▶ gain(env) ──┐
   voice[1] ─ noise ▶ gain(env) ──┼──▶ sum ──▶ filter ──▶ gain(normalized) ──▶ out
   voice[n] ─ ...                 ──┘
```

`out` is either the live `AudioContext.destination` (behind the mute gate) or an
`OfflineAudioContext` render target. **Identical graph either way** — the same
function builds both, so what you hear is what you download. A second builder
for offline rendering is the single most likely way this tool ends up lying to
people, and it is prohibited.

Noise is a `AudioBufferSourceNode` over a short pre-generated white-noise buffer,
generated once per context and reused. Regenerating it per trigger is audible as
a per-play variation and wasteful during rapid-fire.

### 4.2 The attack is the whole game

A click and a beep differ by their attack time, not by their pitch. The control
must reach **1 ms**, and the UI should make the single-digit range easy to land
on rather than something you overshoot — a logarithmic slider with the 1–10 ms
region occupying roughly the first third of its travel.

Web Audio specifics that the build must get right, because each has an audible
failure mode:

- **Attack uses `linearRampToValueAtTime` from a true zero.** Starting from a
  non-zero value clicks. `exponentialRampToValueAtTime` cannot start at zero at
  all — it silently does nothing — which is the most common way a Web Audio
  envelope ends up with no attack.
- **Decay and release use exponential ramps toward an epsilon** (`0.0001`),
  because amplitude perception is logarithmic and a linear decay sounds like it
  stops rather than fades.
- **Every sound ends with a ~2 ms linear ramp to true zero.** An exponential
  ramp never arrives; cutting the node at a non-zero amplitude produces a click
  at the _end_, which is the failure people describe as "cheap".
- **Frequency sweeps are exponential.** Pitch is logarithmic; a linear Hz sweep
  from 880 to 440 spends most of its time in the top half and sounds wrong.
  Exponential ramps cannot reach or cross zero, so `startHz` and `endHz` are
  clamped to ≥ 20 Hz.
- **Nodes are created per trigger and disposed on `ended`.** `OscillatorNode` is
  single-use. Rapid-fire at ten triggers in a second must not leak nodes.

### 4.3 The pitch envelope gets the most prominence

The downward sweep is the most important control in the tool and the UI reflects
that: `startHz`, `endHz` and `sweepMs` are one grouped block with a live sparkline
of the sweep shape, sized larger than the ADSR block and placed above it. Not an
accordion, not a secondary tab.

The interaction that matters is _direction and depth_ — most people want "falls
by about a fourth", not "starts at 880 and ends at 659". So the block shows the
interval between start and end alongside the raw Hz, and dragging the sparkline
adjusts depth directly.

### 4.4 The filter

One filter per sound: lowpass or highpass, cutoff, and Q. This is the brief's
scope and it is the right scope — a second filter stage buys very little on
sounds this short, and cutoff plus resonance already covers "dull vs. bright"
and "thin vs. full", which is what character presets need.

Q above about 12 on a short percussive sound rings audibly after the envelope
closes. The UI caps the slider at 20 but marks the region above 12 as ringing.

---

## 5. Character presets

**A preset applies to the entire set, not to one sound.** It sets the base
frequency, waveform, envelope shape, filter character, noise amount, and the
per-tier gain and duration budgets — then every event sound is regenerated from
those rules, so the set stays internally consistent.

**A preset is a starting point, not a lock.** Editing any parameter afterward
propagates through the set: the derivation in §7 re-runs, pairs stay inverted,
intervals stay intervals. Changing the base frequency moves all eleven sounds.
Changing `tap`'s attack changes only `tap`.

**Presets are declarative data.** `PRESETS: Record<PresetId, PresetDef>` — plain
objects, no code branches anywhere. Adding Warm, Retro, Glassy or Playful in v2
is adding entries to that record and nothing else. If a future preset needs a
knob that `PresetDef` does not have, the knob is added to the type with a
default, not special-cased.

```ts
type PresetDef = {
  id: PresetId
  name: string
  blurb: string // one line, shown under the preset name
  baseHz: number
  waveform: Waveform
  env: Envelope // the shape; per-tier durations scale it
  sweep: {
    /** Depth as a ratio of the end frequency. 1.4 = starts a fourth or so up. */
    depth: number
    /** Share of the sound's duration the sweep occupies, 0–1. */
    share: number
  }
  filter: { type: "lowpass" | "highpass"; cutoffHz: number; q: number }
  noise: { amount: number; decayMs: number } | null
  /** Peak amplitude per tier, before loudness normalization. */
  gain: Record<Tier, number>
  /** Duration budget per tier, in ms. */
  duration: Record<Tier, number>
}
```

### The nine

These numbers are a considered starting point, not final. Presets are the
highest-taste, lowest-code part of this product and they get tuned by ear during
the build (§18); what follows is where that tuning starts and, more importantly,
what each preset is _for_.

#### Soft — "rounded, low, unhurried"

A sine with the top rolled off. Nothing in it is sharp, so it survives being
heard many times a day. This is the safe default and the one to ship if you only
ship one.

|                                    |                          |
| ---------------------------------- | ------------------------ |
| base                               | 720 Hz                   |
| waveform                           | sine                     |
| attack / decay / sustain / release | 8 ms · 90 ms · 0 · 40 ms |
| sweep                              | depth 1.25, share 0.55   |
| filter                             | lowpass 1400 Hz, Q 0.7   |
| noise                              | none                     |
| gain (subtle / notable / alert)    | 0.18 · 0.30 · 0.40       |
| length (subtle / notable / alert)  | 80 ms · 106 ms · 138 ms  |

#### Crisp — "a click, not a beep"

Square plus a noise transient, attack at 1 ms, sweep steep and short. The noise
layer is what makes it read as a physical click rather than a short tone; it is
6 ms long and does most of its work before the oscillator is at full amplitude.

|                                    |                          |
| ---------------------------------- | ------------------------ |
| base                               | 880 Hz (A5)              |
| waveform                           | square                   |
| attack / decay / sustain / release | 1 ms · 35 ms · 0 · 15 ms |
| sweep                              | depth 1.6, share 0.35    |
| filter                             | lowpass 5000 Hz, Q 1.2   |
| noise                              | amount 0.25, decay 6 ms  |
| gain (subtle / notable / alert)    | 0.22 · 0.35 · 0.45       |
| length (subtle / notable / alert)  | 46 ms · 91 ms · 131 ms   |

#### Minimal — "you notice it missing, not present"

Very short, very quiet, narrow. Roughly a third of Soft's loudness and half its
length. The test for this preset is whether you can use the app for an hour
without being able to describe the sounds.

|                                    |                          |
| ---------------------------------- | ------------------------ |
| base                               | 1000 Hz                  |
| waveform                           | triangle                 |
| attack / decay / sustain / release | 2 ms · 24 ms · 0 · 10 ms |
| sweep                              | depth 1.1, share 0.4     |
| filter                             | lowpass 2200 Hz, Q 0.5   |
| noise                              | none                     |
| gain (subtle / notable / alert)    | 0.08 · 0.13 · 0.18       |
| length (subtle / notable / alert)  | 31 ms · 56 ms · 84 ms    |

---

## 6. The sound set

Eleven sounds. The **When** column is not documentation of the UI — it is the
text that ships in the agent markdown, and it is the most valuable thing this
tool produces.

| Sound          | Tier    | When to play it                                                                    | When not to                                                                                                       |
| -------------- | ------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `tap`          | subtle  | A discrete press that commits something small — a button, a segment, a menu item.  | Hover, focus, scroll, or any pointer movement. Never on every keystroke.                                          |
| `toggle.on`    | subtle  | A binary control turning on, when the user turned it on.                           | Programmatic state changes, or restoring saved settings on load.                                                  |
| `toggle.off`   | subtle  | The same control turning off.                                                      | As above.                                                                                                         |
| `open`         | subtle  | A surface the user opened: menu, sheet, drawer, disclosure.                        | Anything that opens by itself, including tooltips on hover.                                                       |
| `close`        | subtle  | The same surface dismissed.                                                        | Route changes and page navigation — those are not closes.                                                         |
| `send`         | notable | Outbound, user-initiated: a message sent, a form submitted, a job queued.          | Autosave, background sync, telemetry, retries.                                                                    |
| `receive`      | notable | Inbound content arriving while the user is present and looking.                    | Bulk arrivals — play once for a batch, never once per item.                                                       |
| `success`      | notable | A user-initiated operation completed. Only on completion the user was waiting for. | Background success, cache warms, or anything they did not start. Never as a page-load chime.                      |
| `error`        | alert   | An operation failed in a way the user must respond to.                             | Validation on a field they have not finished typing in. Never more than once per submit.                          |
| `notification` | alert   | An interruption that is genuinely new information.                                 | Anything the user can see happening. Never when the originating tab is focused and the item is already on screen. |
| `delete`       | alert   | Destructive removal that has actually happened.                                    | Opening a confirmation dialog — that is `open`.                                                                   |

The "when not to" column exists because the failure mode of UI sound is not a
bad sound, it is a good sound played too often. An agent given only eleven
parameter sets will wire them to every event it can find.

---

## 7. The semantic system

This is the differentiator. Four rules, and every sound in the set is derived
from them rather than authored independently.

### 7.1 Three axes, and nothing else

Every sound is declared on three axes. Nothing carries a hand-tuned frequency.

| Axis         | Values                                                      | Owns                  |
| ------------ | ----------------------------------------------------------- | --------------------- |
| **Valence**  | positive / neutral / negative                               | Harmony and timbre    |
| **Register** | lower / mid / higher                                        | Roughly where it sits |
| **Shape**    | flat, ascend, descend, scoopUp, scoopDown, expand, collapse | What the pitch does   |

**Valence is the axis that earns its keep.** `error` is dissonant _because it is
negative_, not because a dissonance was written into that one sound — negative
valence darkens the filter, hardens the resonance, and adds a voice a semitone
away so the two beat against each other. Add a twelfth negative sound and it
gets the same treatment for free. Positive brightens and stays consonant;
neutral does nothing.

It is orthogonal to `Tier`, and both are needed: a notification is positive
_and_ loud; an error is negative _and_ loud; a tap is neutral and quiet. Valence
drives character, tier drives gain and length.

**Shape is a closed vocabulary, and that is what makes the pairs safe.**
`ascend`/`descend` are _stepped_ — two distinct notes, the way a chime moves.
`scoopUp`/`scoopDown` are _continuous_, one note bending into another, which is
the iMessage send-and-receive gesture. Both go the same direction and sound
nothing alike, which is why both exist. `expand`/`collapse` add a filter sweep
on top of the pitch move, because a menu appearing should feel like it _widens_
rather than merely rising — pitch alone cannot say that.

Every "down" shape is _defined_ as the mirror of its "up" twin, so the
inversions hold by construction. This replaced hand-written opposing specs,
which stopped being mirrors the moment a preset scaled them.

### 7.1.1 The set

| Sound          | Valence  | Register | Shape     | Semitones from base     |
| -------------- | -------- | -------- | --------- | ----------------------- |
| `tap`          | neutral  | mid      | flat      | 0                       |
| `notification` | positive | higher   | ascend    | +9, then +12            |
| `open`         | positive | mid      | expand    | +2 → +7, filter opens   |
| `close`        | neutral  | mid      | collapse  | +7 → +2, filter closes  |
| `send`         | positive | lower    | scoopUp   | −5 → +2                 |
| `receive`      | positive | lower    | scoopDown | +2 → −5                 |
| `toggle.on`    | neutral  | higher   | scoopUp   | +5 → +10                |
| `toggle.off`   | neutral  | higher   | scoopDown | +10 → +5                |
| `success`      | positive | mid      | ascend    | +4, then +9             |
| `error`        | negative | mid      | flat      | 0, plus −1 from valence |
| `delete`       | negative | mid      | descend   | 0, then −12             |

Everything derives from one `baseHz` as `base × 2^(semitones/12)`, so nothing in
the set is an arbitrary frequency and two sounds overlapping during fast
interaction land on an interval rather than on a beat.

**Register is a declared label, not a derived one.** It cannot be computed from
a single number once shapes travel: `close` starts high and lands mid, `delete`
starts mid and lands low, and both are honestly "mid" to a listener. What is
enforced is the _ordering_ — lower sits below mid sits below higher on average,
which is the part anyone would notice being wrong.

**A floor of 330 Hz** applies to every resolved note. A preset's `sweepScale`
multiplies the semantic interval, and an aggressive one compounds on an already
low sound: Sci-Fi's 3× on `send`'s seven-semitone scoop put its start at 274 Hz,
inside the small-speaker rolloff and effectively silent on a laptop. Clamping
lets a preset be as dramatic as it likes without any sound diving out of
audibility.

### 7.2 Pairs are generated from each other

Four pairs, each defined as one sound plus a transform. Editing either member
re-derives the other, so they cannot drift apart.

| Pair                       | Relationship                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggle.on` ↔ `toggle.off` | **Inversion.** Same voices, same envelope, `startHz` and `endHz` swapped.                                                                                                                                            |
| `open` ↔ `close`           | **Inversion.** As above.                                                                                                                                                                                             |
| `send` ↔ `receive`         | **Inversion plus filter direction.** `send` opens the filter as it rises; `receive` closes it as it falls.                                                                                                           |
| `success` ↔ `error`        | **Not an inversion.** Contrast in consonance, not direction: success is a consonant rising interval, error a dissonant falling one. Inverting success would produce a falling major fourth, which is `notification`. |

That last row is worth stating because "confirm rises, dismiss falls" is only
two-thirds of a rule. Applied blindly to success/error it collides with an
existing sound.

Edits propagate along the pair, not around a cycle: editing `toggle.on`
re-derives `toggle.off`; editing `toggle.off` re-derives `toggle.on`. The
implementation stores one canonical member per pair plus the transform, so there
is no feedback loop to guard against.

### 7.3 Intensity tiers

Three tiers, mapped to how much attention the event deserves, and they control
gain and duration budget together — a louder sound that is also longer is twice
as intrusive, and coupling them stops that happening by accident.

| Tier    | Sounds                          | Meaning                                                  |
| ------- | ------------------------------- | -------------------------------------------------------- |
| subtle  | tap, toggle.on/off, open, close | The user caused it and already knows. Confirmation only. |
| notable | send, receive, success          | Worth registering, not worth stopping for.               |
| alert   | error, notification, delete     | Requires attention or marks something irreversible.      |

### 7.4 Duration budget

**Warn past 200 ms.** Long UI sounds are the main failure mode of this whole
category — they overlap the next interaction, they cannot be triggered twice in
a row, and they make an interface feel slow in a way people attribute to
performance.

The budget is shown per sound as a bar against its tier's allowance, and the
warning at 200 ms is set on the total sounding duration, not on `durationMs`
alone — a 180 ms sound with a 40 ms release is a 220 ms sound. Of the eleven,
only `notification` is expected to approach the line; if `tap` is over it,
something is wrong.

The warning is a statement, not a block. Consistent with the family's stance on
honest failure (`DESIGN-LANGUAGE.md` §8, item 15), the tool says what the cost
is and lets you ship it, and the agent markdown reports it too.

---

## 8. Loudness normalization

Nothing in the set may spike relative to its siblings. The build renders every
sound offline at resolve time, measures it, and computes a per-sound gain that
brings it to its tier's target.

**The measurement is A-weighted RMS over the sound's actual duration**, not
LUFS. This is worth stating plainly because LUFS is the obvious choice and it is
wrong here: ITU-R BS.1770 gates on 400 ms blocks and discards blocks below a
relative threshold. Every sound in this set is shorter than one gating block, so
the standard's own algorithm does not have an opinion about them. A-weighted RMS
over the real duration is simple, defensible, and matches perception well enough
at these lengths and levels.

After normalization, true peak is checked and anything above **−1 dBFS** is
scaled down. Square waves plus resonance can clip, and a clipped UI sound is
audibly broken on small speakers.

The result is one number per sound, `normalizedGain`, stored on the resolved
sound. Live playback, the offline WAV render, the JS export and the JSON all
read that same number. Normalization never runs inside the playback path — if it
did, rapid-fire and A/B compare would drift from the exported file.

---

## 9. Preview

### 9.1 Real UI, never an abstract play button

Sounds are triggered by components behaving like components. Each surface maps
to the sounds it would actually fire in a real app:

| Surface                | Fires                             |
| ---------------------- | --------------------------------- |
| Button row             | `tap`                             |
| Toggle switch          | `toggle.on`, `toggle.off`         |
| Form with a submit     | `send`, then `success` or `error` |
| Notification card      | `notification`, `receive`         |
| List row with a delete | `delete`                          |
| Menu / sheet           | `open`, `close`                   |

A play button next to a waveform tells you what a sound is. It does not tell you
what it is like to use, which is the only question that matters.

### 9.2 Rapid-fire — the annoyance detector

**Ten triggers in fast succession, on one control, prominent in the layout.**
This is the single best test for whether a sound is tolerable and almost no tool
offers it. It is a primary control sitting with the preview surfaces, not an
option in a menu.

Default interval 120 ms, adjustable 60–400 ms. Two things it must get right:

- **Voices overlap; they are not cut off.** Retriggering by stopping the
  previous instance is a different sound and hides the exact problem being
  tested — a long release tail stacking into mush.
- **A polyphony cap of 16 simultaneous voices**, oldest released first. Without
  one, a 400 ms sound at 60 ms intervals climbs in amplitude until it clips,
  which reads as a bug rather than as the intended verdict.

A sound that survives rapid-fire at 120 ms is safe. Most first attempts do not.

### 9.3 Sequence preview

`tap → send → success` played as a flow, with realistic gaps (~250 ms and
~600 ms), so the set is heard as a sequence rather than as eleven separate
things. This is where interval clashes and volume mismatches between tiers
become obvious.

### 9.4 The audio gesture gate

Browsers will not start an `AudioContext` without a user gesture, and a tool
that fails silently here looks broken.

The page loads with audio **armed but not started**. The preview area shows a
quiet, explicit affordance — an "enable sound" state that reads as a control,
not as an error — and the first click anywhere in the preview both starts the
context and fires the sound that was clicked, so the first interaction is not
swallowed. After that the state chip becomes the mute toggle.

The context is created once, suspended and resumed rather than recreated;
creating a context per interaction exhausts the browser's limit.

**Note the distinction from the export.** In the tool, sound is on — that is the
point of the tool. In the exported code, the gate defaults to **muted** (§10).
These are different defaults for different reasons and the build must not
collapse them.

---

## 10. Restraint and accessibility

- **Loudness-normalized across the set** (§8), so nothing spikes relative to its
  siblings.
- **Every export ships behind a global mute gate that defaults to off** — the
  consuming app must opt in explicitly, per user, and persist that choice.
  Stated in the markdown as a requirement, not a suggestion (§13). Nothing this
  tool produces ever autoplays.
- **Frequency guidance is on screen, not in a footnote.** The set is drawn on a
  **spectrum rail** — a horizontal frequency axis with every sound's span
  plotted on it, against three marked zones:

  | Zone                | Range                                   | Why it is marked                                                                                                                                                                                                                                                                                                                            |
  | ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Small-speaker floor | below ~300 Hz solid, ~300–500 Hz graded | Small speakers produce little useful output below roughly 250–300 Hz, and a small sealed enclosure can roll off from as high as 800 Hz. The zone is drawn as a gradient rather than a line because the exact knee depends on the enclosure, not on a standard — the honest statement is "increasingly unreliable", not "inaudible below X". |
  | Harsh band          | 2–5 kHz                                 | The ear's most sensitive region. Peaks here read as piercing at volumes that seem fine elsewhere.                                                                                                                                                                                                                                           |
  | Dead air            | above ~12 kHz                           | Nothing useful, inaudible to many adults, and pure file size.                                                                                                                                                                                                                                                                               |

  At the default base of 880 Hz the whole set sits between 440 Hz and about
  1.8 kHz, clear of all three. Drag the base down to 220 Hz and `delete` bottoms
  out at 110 Hz — the rail shows that immediately, which is the point of drawing
  it rather than writing a guideline.

- **`prefers-reduced-motion` is not the relevant signal**, and the export says
  so. There is no media query for "prefers reduced sound"; the mute gate is the
  mechanism, and it must be reachable from the app's own settings.
- Haptic mapping per sound is v2 (§17).

---

## 11. Export

The export panel is the product. It uses the family's shared `ExportPanel` —
the code-vs-agent-prompt fork, the terminal that stays dark in both themes, the
format tabs, the download and copy affordances — with no visual deviation.

### 11.1 The formats

| Tab          | Scope     | Emits                                                                                                               |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------- |
| **JS**       | whole set | The synthesis runtime plus the resolved set as a literal. Zero audio assets, zero dependencies. The primary export. |
| **WAV**      | per sound | 16-bit mono PCM at 44.1 kHz, rendered via `OfflineAudioContext`.                                                    |
| **Data URI** | per sound | The same WAV, base64'd, for inlining with no network request.                                                       |
| **JSON**     | whole set | The full resolved parameter set.                                                                                    |
| **Markdown** | whole set | §13. Carries intent.                                                                                                |
| **Native**   | per sound | The WAV plus an `AVAudioPlayer` snippet.                                                                            |

Per-sound tabs share one sound selector, rendered in the panel's existing
`options` sub-bar. That is what makes "eleven files, one file per tab" coherent
without a zip: you pick a sound in the sub-bar and the tab's filename, preview
and download follow it.

### 11.2 The WAV encoder

Hand-written, no dependency: a 44-byte RIFF header and interleaved PCM, about 50
lines. It takes `(channels, sampleRate, bitDepth)` as parameters even though v1
only ever calls it as mono/44100/16 — see §17.

Size is honest arithmetic: 150 ms mono at 44.1 kHz 16-bit is 13,230 bytes.
**Base64 inflates that by a third, so the data URI is ~17.6 KB, not 13 KB.** The
panel's fidelity note states the real number for the selected sound rather than
the uncompressed one, because the data URI is the format where size is the
reason you chose it.

### 11.3 The extension the shared layer needs

`ExportPanel` today types every format as `render: () => string` and downloads
via `new Blob([content])`. A WAV shipped through that path is UTF-8 mangled.
Rather than solve it locally, the shared type gains an optional binary channel:

```ts
export type ExportFormat = {
  // ...unchanged...
  render: () => string // still required — this is the preview text
  bytes?: () => Uint8Array // when present, download ships these instead
}
```

`download()` prefers `bytes()` when it exists and falls back to `render()`
otherwise. No existing format in Ramps or Motion sets `bytes`, so both are
byte-identical in behavior; the change is additive and carries no risk to either
live site.

For the WAV tab, `render()` returns a readable summary — duration, sample rate,
byte size, peak level — because binary in a `<pre>` is noise. This is a small
honesty win: the terminal shows you what you are about to download rather than
pretending a WAV is text.

---

## 12. Why not MP3, AAC or MP4 — agreed, with one more reason

The brief rules these out and is right. Restated so the decision survives being
questioned later:

1. **Compression is pointless at this size.** Saving 8 KB on a 13 KB asset that
   is fetched once and cached forever is not worth a format decision.
2. **In-browser encoding needs WebCodecs plus a muxer**, with uneven Safari and
   Firefox support. That is a dependency and a compatibility matrix in a tool
   whose core has neither.
3. **Lossy codecs smear transients** — precisely the sharp attacks this tool
   exists to tune. A 1 ms attack does not survive a psychoacoustic model built
   for music.

And one the brief does not mention, which is the most concrete of the four:

4. **Encoder delay corrupts the timing.** MP3 and AAC prepend priming samples —
   typically 576 to 2112 depending on encoder — which is 13 to 48 ms of silence
   at 44.1 kHz. On a 55 ms Crisp `tap` that is up to _most of the sound's
   length_ in latency, added before anything is audible. Handling it requires
   gapless-playback metadata that most web playback paths ignore. A format that
   silently delays a click is disqualifying for a tool about clicks.

WAV is uncompressed, exact, universally supported, and trivially encodable in 50
lines. There is no case to answer.

---

## 13. Agent legibility

An agent cannot hear a WAV, so the markdown carries the weight. It follows
Motion's `toAgentMarkdown` structure and must contain, in this order:

1. **The permalink**, first line after the title. The exact configuration.
2. **The character, in words.** "Crisp, base 880 Hz, square with a noise
   transient, 1 ms attack" — so an agent can describe the set without parsing
   it.
3. **The set as a table**, with the _When to play_ and _When not to_ columns from
   §6 verbatim. This is the section that makes the export worth having.
4. **The synthesis function**, complete and inline, so the agent writes code
   rather than managing an asset pipeline. The mute gate is inside it.
5. **The mute gate as a requirement**, stated imperatively: sound is off until
   the user opts in, the preference persists, and nothing plays on load. Not
   phrased as a recommendation.
6. **The relationships**, so an agent can add a twelfth sound correctly: the
   base frequency, the interval table, which pairs are inversions, what the
   tiers mean, and the 200 ms budget. An agent asked for a "share" sound should
   be able to derive one that belongs.
7. **Frequency and accessibility guidance** — the three zones from §10.
8. **Changing this set** — the URL contract, documented well enough to construct
   a link (§14).
9. **Other tools in this family**, via the shared `familyAsText()`, matching
   Ramps and Motion.

The rule inherited from Ramps: the markdown and the on-page machine-readable
block render from the same function. There is never a second serialization.

---

## 14. URL state

Full state in the query string, deltas from the active preset only, short keys.

**No base64.** The original brief specified "base64 the result"; that step was
dropped by agreement. The reasoning is kept here because it is the kind of
decision that gets re-proposed later:

1. **Base64 makes the URL longer, not shorter.** It encodes 3 bytes as 4 — a
   flat 33% inflation. It only shortens things when paired with compression, and
   there is no compression worth running at this size: on a payload of ~150
   characters, whatever DEFLATE saves is largely given back by its own framing
   and then by base64's inflation on top — and `CompressionStream` would make
   decoding async on a code path that is currently synchronous and pure.
2. **The payload is already tiny.** A preset plus three tweaks is about
   `?p=crisp&tap=f900.a2&err=g-3` — 30-odd characters. Even a heavily edited
   set, with every one of the eleven sounds carrying several overrides, lands
   around 150. The brief's actual requirement — "a few hundred characters" — is
   met comfortably by the readable form and _missed sooner_ by the base64 one.
3. **It breaks the thesis.** This tool's headline claim is agent legibility.
   Motion documents its URL syntax in `llms.txt` and in the "Changing this set"
   section of its markdown precisely so an agent can hand-construct a link. An
   opaque blob can still be produced by a machine, but it cannot be read,
   diffed, or explained — and the "Changing this set" section becomes a
   base64 tutorial instead of a parameter table.
4. **It costs debuggability for nothing.** A malformed readable link degrades
   field by field, which is how the family's decoders already work. A malformed
   base64 blob fails whole.

So: readable short keys, in the family's existing idiom:

```
p     Preset id: soft | crisp | minimal. Default soft.
b     Base frequency in Hz, 220–2000. Omitted when it matches the preset.
<id>  One key per edited sound, "." between fields. Omitted entirely when the
      sound is exactly what the preset derives. Fields are two-letter codes
      followed by a number — f900 (start Hz), e660 (end Hz), a2 (attack ms),
      d40 (decay ms), r15 (release ms), n120 (duration ms), g-3 (gain trim, dB),
      c1400 (cutoff Hz), q7 (Q ×10).
```

`.` and `*` and `-` and `_` are the punctuation `URLSearchParams` leaves alone —
the same set Motion's `params.ts` documents, for the same reason. Every field is
validated independently so a bad link degrades to the preset rather than
erroring, matching Ramps and Motion.

---

## 15. Architecture

```
src/
  runtime/
    beeps.js          ← the synthesis runtime. Plain JS, no TS syntax, no imports.
                        The app runs it; the JS export ships its source verbatim.
  lib/
    sounds.ts         ← the set, the intervals, the pairs, the tiers
    presets.ts        ← PRESETS as declarative data
    resolve.ts        ← preset + deltas → the concrete SoundSet
    loudness.ts       ← A-weighted RMS, peak check, per-sound gain
    wav.ts            ← the encoder. (channels, sampleRate, bitDepth)
    params.ts         ← the URL codec
    export.ts         ← every format, including toAgentMarkdown
    agent.ts          ← the payload envelope, JSON + text
  components/         ← the editor, the preview surfaces, the spectrum rail
  shared/             ← the family layer. Authored in Ramps. Never edited here.
```

**Three rules the build must hold to:**

**One resolve, many readers.** `resolve.ts` turns a preset plus deltas into a
complete, concrete `SoundSet` with every frequency computed and every
`normalizedGain` filled in. Live playback, the offline render, the WAV, the data
URI, the JS export, the JSON and the markdown all read _that object_. No
consumer recomputes anything. This is the same rule as Ramps' "the exporters in
`semantics.ts` are canonical — don't create a third serialization", and it is
what guarantees the download matches what you heard.

**No module-level state.** No module-scope `AudioContext`, no module-scope
"current config". The context is created once by the app and passed in; the
config is a plain value passed in. A `SoundSet` can be instantiated twice
without anything global tearing — which is exactly what v2's A/B compare needs,
and what makes the whole of `lib/` testable in Node.

**One runtime, shipped verbatim.** `src/runtime/beeps.js` is the only synthesis
implementation. The app imports it as a module; the JS export imports its text
(`?raw`) and ships it alongside the resolved set as a JSON literal. There is no
second, template-generated copy of the synthesis logic to drift — which is the
failure the family's "don't create a third serialization" rule exists to
prevent. The agent payload built inside a Vercel Function reads the same file;
a test asserts the two paths produce identical text.

### Testing

`lib/` is pure and framework-free, so it tests in Node with vitest, matching
Motion: interval maths, preset resolution, delta encode/decode round-trips,
loudness gain given a `Float32Array`, and WAV header bytes given a known buffer.

Web Audio is not available in Node and I am not adding a mock of it. Graph
construction is verified in the browser and by listening — which is the honest
statement, and the reason §18 puts "tune the presets by ear" in the build order
as real work rather than as polish.

---

## 16. Dependencies

**Zero new runtime dependencies.** Web Audio is native. The WAV encoder is
hand-written. Base64 is `btoa`. The stack is exactly Motion's: React 19, Vite,
Tailwind v4, TypeScript strict, `motion`, `clsx`, `tailwind-merge`, Phosphor
icons, three Fontsource families, and the two Vercel analytics packages.

Nothing in this spec justifies a package. If that changes during the build, it
gets asked about before it is installed, per `~/CLAUDE.md`.

---

## 17. What v1 decisions would cost v2

The brief asks for this explicitly. Each deferred item, and what v1 does so it
stays cheap:

| v2 item                                         | Accommodation in v1                                                                                                                                                        | Cost if added later                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Second oscillator at a fixed interval           | `voices` is a list and the summing path is already exercised by `success`, `notification` and `error`. `Voice` carries `detuneSemitones` and `startOffsetMs` from day one. | **Free.** One more entry in a preset's voice list.                                                                                 |
| Warm / Retro / Glassy / Playful                 | `PRESETS` is a `Record<PresetId, PresetDef>` of plain data. No code branches on preset id anywhere.                                                                        | **Free**, unless a preset needs a knob `PresetDef` lacks — then one optional field with a default.                                 |
| A/B compare two presets                         | No module-level state; a `SoundSet` is a value that can be instantiated twice. Normalization is precomputed per set, so two sets do not fight over gain.                   | **Small.** A scheduler that plays two sets back to back, plus UI.                                                                  |
| Zip of the full set                             | None needed, as the brief says. `wav.ts` already returns `Uint8Array`.                                                                                                     | **Small.** A stored-mode (uncompressed) zip writer is ~100 lines and needs no dependency, since WAV does not benefit from DEFLATE. |
| Haptic mapping                                  | None needed.                                                                                                                                                               | **Small.** One field per sound plus a markdown section.                                                                            |
| Filter envelope                                 | `Filter` is its own object rather than fields inlined on `Sound`.                                                                                                          | **Small.** An optional `env` on `Filter`.                                                                                          |
| Sample-rate choice (22.05 kHz halves the bytes) | `wav.ts` takes `sampleRate` as a parameter and `OfflineAudioContext` takes it at construction, even though v1 only calls 44.1 kHz.                                         | **Free.** One select in the existing `options` sub-bar.                                                                            |
| Stereo / stereo width                           | `wav.ts` takes `channels`.                                                                                                                                                 | **Small**, but I would argue against it — UI sound should be mono, and a panned notification is a bug on a laptop.                 |

**One thing I have not accommodated, deliberately:** per-sound custom waveforms
or wavetables. It would mean the parameter set no longer fits in a URL, which
breaks the no-persistence constraint. If that is ever wanted it is a different
tool.

---

## 18. Build order

Small commits, working state at each. The first three are the family cleanup
approved in Phase 1, done first because the sync script is a prerequisite for
everything after it.

1. **Family fixes.** Add `sync` / `sync:check` to Ramps' `package.json`; correct
   Motion's stale `CLAUDE.md` status line; reconcile `DESIGN-LANGUAGE.md`'s task
   lists with what has shipped. Sync the manifest change from Phase 1.
2. **Extend `ExportPanel` with the optional `bytes` channel** (§11.3) in Ramps,
   sync outward, confirm Ramps and Motion are unchanged.
3. **Scaffold the repo** — Vite, Tailwind, `base: "./"`, the shared layer, the
   `ToolShell` rendering with a title and nothing else.
4. **`lib/` first, with tests** — sounds, presets, resolve, loudness, wav,
   params. No UI. This is where correctness lives.
5. **The runtime and live playback** — `beeps.js`, the gesture gate, one button
   that fires `tap`.
6. **The full preview** — all six surfaces, rapid-fire, the sequence.
7. **Tune the three presets by ear.** Real work, not polish. Budget for it.
8. **The editor** — pitch envelope block first, since it is the most important
   control; then ADSR, filter, tier and duration.
9. **The spectrum rail and the duration budget warnings.**
10. **Export** — JS, WAV, data URI, JSON, native, then the markdown last, since
    it describes everything above it.
11. **Agent surfaces** — the on-page machine-readable block, `llms.txt`,
    JSON-LD, and the `api/` pair, verified with a real no-JavaScript fetch.

---

## 19. Decisions taken, and what is still open

**Taken, and I would defend these:**

- Readable URL params, no base64 (§14) — a departure from the original brief,
  agreed.
- A-weighted RMS rather than LUFS for normalization (§8), because the standard's
  gating window is longer than every sound in the set.
- `success` and `error` are a contrast pair, not an inversion (§7.2), because
  inverting `success` produces `notification`.
- Mono only. A panned UI sound is a defect.
- The static bundle is the complete tool; `api/` is strictly additive for
  no-JavaScript agents, per Phase 1 and `DESIGN-LANGUAGE.md` §8.G.

**Open, and yours to call:**

- **Base frequency: 880 Hz**, resolved against sources in §7.1.1 rather than by
  preference. It is the value where the set's full ±12-semitone span clears both
  the small-speaker rolloff and the 2 kHz harsh band, and it sits inside the
  350–1000 Hz range earcon research treats as typical. Soft overrides to 720 Hz,
  the lowest any shipped preset goes.
- **`tap` stays a distinct sound**, not the subtle tier's reference tone. The
  reason is edit semantics, not taxonomy: as a tier reference, tuning `tap`
  would drag `toggle`, `open` and `close` with it. It is the sound that fires
  most often in a real app and the one that gets fiddled with most, so it needs
  to move independently of its tier.

**Still open:**

- **The manifest blurb** still reads "Short interface sounds that agree with the
  motion they accompany," which promises motion-coupling that is not in v1
  scope. Left alone for now by agreement — it is a `soon` tool, so nothing is
  being misrepresented yet. Revisit it in the same edit that adds `wordmark`,
  `domain` and `status: "live"` at launch, when that entry is being touched
  anyway.
