# Next Up

> **What this file is for:** Session handoff state — what was most recently
> built, what to do next, and known blockers. Read at the start of a session,
> update at the end. Previous sessions stay as a rolling log. Not a spec — see
> [`SPEC.md`](SPEC.md) for that, [`CLAUDE.md`](CLAUDE.md) for conventions and
> [`PROJECT_MAP.md`](PROJECT_MAP.md) for the file inventory.

## Current state

**LIVE at https://www.beeps.studio** — Vercel project `beeps`, repo
https://github.com/imryanreid/beeps (public, MIT). DNS is configured, both
certificates are issued, and the apex 308-redirects to `www` via
`vercel.json` — matching ramps.studio and springs.studio, and version
controlled rather than set in the dashboard so it cannot silently differ.

Everything in the v1 scope works: the synth core, nine presets, the
eleven-sound set, semantic pairing, FM, space, per-sound voices, rapid-fire
preview, URL state, the per-sound editor with the spectrum rail, and all six
exports. 166 tests. Builds clean and runs from `file://`.

**Still to do:** the no-JavaScript agent surface (`middleware.ts` + `api/`), an
OG card, and the upstream manifest flip — deliberately deferred until the tool
is actually ready, so ramps.studio and springs.studio still show Beeps as
"soon". The presets have had several rounds by ear but the newest numbers (FM
indices, room sizes) are measured, not heard.

## Session log

### 2026-08-10 — recon, spec, scaffold

**Recon.** Read the whole family. The shared layer and `DESIGN-LANGUAGE.md`
already existed and are substantial, so this tool writes almost no interface
chrome — the page shell, export modal, terminal panel, switcher, footer
directory, segmented controls, labels and copy affordances are all inherited.

**Three fixes landed upstream** on branch `family-prep-for-beeps` in both Ramps
and Motion:

- `ExportPanel` gained an optional `bytes?: () => Uint8Array`. It could only
  ship text, and a WAV sent through `new Blob([string])` is UTF-8 encoded on the
  way out — corrupt and ~1.5× too big, silently. No existing format sets it, so
  Ramps and Motion are unchanged.
- Ramps could not run `pnpm sync` or `pnpm sync:check` — the script and the
  `.is-upstream` marker existed, the `package.json` entries never did.
- Motion's `CLAUDE.md` still said "scaffolded, not built"; `DESIGN-LANGUAGE.md`
  task lists predated their own completion. Both reconciled against the tree.

**Manifest.** The `sound` entry became **Beeps — "UI sounds & feedback"**. No
`wordmark` or `domain` yet, deliberately: beeps.studio isn't registered, and the
manifest's own rule is not to assert a URL before it resolves.

**Spec decisions worth remembering:**

- **No base64 on URL state**, against the original brief. Base64 inflates by
  33% — it makes the URL _longer_ — and an opaque blob can't be hand-constructed
  by the agents this tool is built for.
- **Base 880 Hz**, derived rather than chosen. `delete` drops an octave and
  `notification` reaches one, so the base has to place a ±12-semitone span
  between the phone-speaker rolloff and the 2 kHz harsh band. 880 is where it
  fits; Soft overrides to 720.
- **A-weighted RMS, not LUFS**, for normalization — BS.1770 gates on 400 ms
  blocks and every sound here is shorter than one.
- **`success` and `error` are a contrast pair, not an inversion.** Inverting
  `success` produces a falling fourth, which is already `notification`.

**Verified:** `pnpm build` clean, relative asset paths confirmed, and the built
page renders correctly from `file://` with fonts, theme and the footer
directory intact.

### 2026-08-10 — v1 built

Built in the order `SPEC.md` §18 sets out. Four commits: the model and presets,
the pure modules, the runtime and preview, then export and the editor.

**Three things the tests caught that were real bugs, not bad tests:**

- **Declared mirrors are not mirrors.** The inversion pairs were written as
  opposing specs (`+2 → +7` against `+7 → +2`), which only inverts exactly when
  a preset leaves sweeps alone. Any preset that scales them compresses each
  toward its own destination, and the pair drifted ~48 Hz apart on Soft. Now
  one member is canonical and the other takes its resolved pitches swapped,
  after both are built.
- **Two presets broke the rule §7.1.1 derives.** The harsh-band ceiling is set
  by the highest note _plus_ the preset's intrinsic glide, not by the base
  alone — so Crisp put `notification` at 2093 Hz and Minimal at 2119 Hz. Crisp's
  intrinsic sweep went 3 → 2, Minimal's base 1000 → 900.
- **A percussive envelope was padding itself with silence.** Duration is a
  budget, not a mandate; with `sustain: 0` the sound is over once it has
  decayed. The 200 ms warning was measuring dead air.

**Verified in a real browser, not assumed.** AudioContext was instrumented to
count real oscillator creation: rapid-fire builds one context in state
"running" and ten overlapping oscillators sweeping 704 → 641 Hz, which is
720 Hz base at −0.4 → −2 semitones. `delete` adds ten noise sources and lands
on 360 Hz. The WAV encoder emits a valid RIFF header at 44100/16/mono with the
declared data size matching the byte count exactly. Across all three presets
the worst peak after normalization is −5.11 dBFS — nothing clips.

Pair mirroring was checked end-to-end in the running app: editing `close`'s
start frequency writes `?open=e1100` — routed upstream to the canonical member,
mirrored — and nothing under `close=`, so there is no stored value for
`resolve()` to overwrite.

### 2026-08-12 — distinctness

Ry reported four collisions by ear — `receive`/`delete` on Crisp,
`tap`/`error` on Glassy and Retro, and Glassy sounding metallic rather than
glassy. They were one bug, and a confusion matrix across all nine presets
found two more nobody had noticed.

**The semantic layer had more names than behaviours.** `expand` shared a
switch branch with `scoopUp` and `collapse` with `scoopDown`, so `open` was
`toggle.on` transposed three semitones — in every preset. Six of eleven
sounds were duplicated in contour and register. It surfaced preset-by-preset
because presets that suppress pitch legibility expose it, which is exactly
how it would have been patched three separate times.

Shapes now differ in *behaviour*: `glideShareFor` gives scoops half the glide
time of a size change, so a gesture arrives early and holds where an expand
is still moving at the end. Registers spread, and `lengthScale` lets one tier
hold sounds of different lengths.

**Glassy was metallic because of a change made the round before.** Raising
its tails to 1.5/1.9 so it would "ring like a bell" doubled its spectral
centroid between onset and decay — 988 → 2137 Hz on `tap`, where Soft moves
761 → 834. A sound that gets *brighter as it dies* is a struck bell, and a
bell is metal. Partials now fade before the note: ×0.77, the most sharply
darkening preset in the set.

Worth remembering: the first diagnosis (triangle harmonics + resonant Q) was
measurable but only ~6% of the centroid — triangle harmonics fall off as
1/n² and the lowpass had already taken most of them. Measuring the rendered
audio rather than reasoning about the model is what found the real cause.

`src/lib/distinctness.test.ts` is new and is the check that was missing: it
fails if any two sounds match on pitch, direction, travel and glide at once.

### 2026-08-12 — in tune

Ry: "`receive` sounds too negative, across the board. I think because it's a
sharp? Or not an even drop in pitch?" That guess was right, and it was the
same cause behind Retro reading as "a mix of neutrals and sad opposites" and
Glassy's `delete` sounding like it belonged to a different preset.

**A pair's falling member inherited the rising member's swept start as its
landing.** That start is `to + (from − to) × sweepScale` — preset-dependent
and generally fractional — so every falling half landed *between two notes*,
by a different amount on each preset. Measured: `receive` landed 40 cents
sharp of a fourth on Soft, on a tritone on Minimal, and 50 cents off — a
literal quarter-tone — on Retro.

`delete` was the control that proved it. Not a pair member, lands on its
declared octave everywhere, and it was the one falling sound Ry singled out
as clean and wanted the rest to match.

Pairs now mirror **at the note**: both halves land on declared integer
intervals, identical across all nine presets, and each computes its own
glide. Every landing is consonant — unison, M2, M3, P4, P5 or M6, no minor
thirds or sixths. That is the difference between a neutral opposite and a sad
one, and it is the "consistent pattern across presets" that was missing.

**The trade:** the exact frequency palindrome is gone. It was the tighter
invariant and the wrong one — six tests asserted it and now assert the new
contract by round-trip instead.

One design trap worth remembering: pitch deltas are only ever stored on the
canonical member, so the derived member **must** derive from it. Resolving
the derived member purely from its own notes looked cleaner and silently
broke editing — an edit to `close` would have done nothing.

### 2026-08-12 — Glassy was a xylophone

Ry: "still feels much more like a xylophone — slightly metallic, sharp." He
was describing the file. A xylophone bar is undercut until its first overtone
lands exactly a twelfth above the note — 3x the fundamental — and the `19`
layer was 2.9966x. Struck, harmonic, short. It had been a xylophone all along.

That is also why three rounds of tuning kept landing on bell, then tin, then
xylophone: every attempt adjusted the *strength* and *length* of a harmonic
partial, and glass's whole character is that it barely has one.

| | xylophone | glass |
|---|---|---|
| partials | strong, harmonic (3x) | weak, **inharmonic** (~2.3x) |
| decay | fast, percussive | **long** — it rings |
| identity | the strike | the pure, sustained fundamental |

So the preset kept its numbers and took its real name, and a new **Glassy**
was built on the opposite recipe: one dominant sine plus a single partial at
14.5 semitones (2.32x — deliberately not a musical interval, so it colours the
note instead of harmonising), gain 0.075, tail **below 1** so it fades before
the note. Length lives in the fundamental. Ten presets now.

**A measurement caveat worth keeping.** The decay-brightness ratio used in
earlier rounds reads garbage below about −60 dBFS. It reported the new Glassy
at ×1.54 — the bell signature — from a window sitting at −83.8 dBFS, fourteen
bits under peak. Gated to where the sound is audible it is ×1.19, between Soft
(1.08) and Warm (1.26). Gate that metric by level before trusting it.

The preset **id** changed, which is only safe because no URL has shipped. An
unknown id falls back to Soft with the "did not arrive intact" warning —
verified in the browser, not assumed.

### 2026-08-12 — a wider palette

Ry: "the different presets still aren't sounding dramatically different to
me. What did we defer that could give it a much more distinct, varied set of
voices?" The honest answer was that nothing was deferred — the palette was
narrow by construction. Every preset was the same chain: one to three
oscillators from four waveforms, one static filter, an AD envelope. One
timbral mechanism, so every preset was necessarily the same instrument
adjusted.

Three things landed, in the order they were built:

**FM.** A second oscillator connected to the carrier's *frequency* rather
than mixed into the output. The ratio decides where sidebands fall — whole
numbers on harmonics (body), fractional between them (struck metal, wood,
glass). Six presets take one. Spectral flatness on `tap` roughly doubles for
the three meant to be distinct instruments (Xylophone 0.102 → 0.201, Sci-Fi
0.263 → 0.504, Glassy 0.077 → 0.135) and barely moves for Warm and Bloopy,
which use unison and sub-harmonic ratios on purpose. Across the set flatness
now spans 12.3×.

**Space.** A short delay fed back through a lowpass, so each pass is quieter
*and* darker. Four presets are wet, six dry. Audible time roughly doubles on
the wet ones. Its tail counts against `DURATION_BUDGET`, and the constraint
that binds is the **subtle** tier, not notable — `open` on Xylophone is
barely 100 ms dry, so every room here is sized by its shortest sound.

**Per-sound presets.** Timbre varies per sound; **pitch stays global**, so a
mixed set is one key with different instruments rather than eleven unrelated
sounds. Pairs are locked because `close` derives from `open` through that
preset's `sweepScale`. URL form: `tap=vcrisp.f720` — dot-separated, since
`encodeDelta` splits on dots and a comma silently ate every co-located edit.

**Two measurement lessons from this round**, both of which produced a wrong
answer first:

- Reverb is *energetically* tiny even when perceptually obvious. An
  energy-share metric reported the room tails at 0.0% while they were plainly
  present at −21 to −43 dB. Measure how long a sound stays above a threshold.
- The distinctness test counted a 3.67× glide *ratio* as a difference without
  checking either glide was audible — 26 ms vs 7 ms is a big ratio between two
  pitch jumps. It now requires the longer glide to clear 25 ms, which
  immediately surfaced a second real collision (`tap`/`toggle.off`).

### 2026-08-13 — public, deployed, on its own identity

Repo created and pushed, Vercel project linked, production deploy Ready, both
domains attached. Adds `src/lib/site.ts`, the canonical / og: / JSON-LD block,
`robots.txt`, `sitemap.xml`, `llms.txt`, and icons — the favicon is a decaying
oscillation (an envelope, which is what this tool makes) on the family plate,
with `scripts/build-icons.py` rendering the PNG fallbacks from that same shape
in pure stdlib, matching Ramps.

**Nothing upstream changed**, by request. The shared manifest still carries
Beeps as `status: "soon"` with no `domain`, so ramps.studio and springs.studio
go on showing it as unreleased. That reads correctly on this site too — the
shared directory already renders the tool you are ON as current rather than as
"soon". The one thing that reads wrong until the upstream flip is
`familyAsText()` listing Beeps as "not yet released" in the exported agent
markdown, on its own live site.

**A false claim caught by the right check.** `llms.txt`, `robots.txt` and the
JSON-LD all said a no-JavaScript fetch returns the complete set. It does not —
this is a client-rendered page and the served HTML is 6.3 KB of shell. All
three were written from Ramps' pattern, and Ramps can say it because it has the
middleware and `/api/palette`. `CLAUDE.md` warned about exactly this: *"verify
with a real no-JavaScript fetch — a browser check proves nothing there."* The
browser check passed, because in a browser the claim is true. Corrected before
anyone read it; `llms.txt` is the one document an agent is entitled to trust
without checking.

## Next

1. **A listening pass on what changed after the last one.** Signed off already:
   Glassy ("nailed it, much clearer and cleaner"), Warm ("PERFECT"), the
   in-tune landings, pair distinctness, `tap`/`error`, the `open`/`toggle.on`
   landing collision, and the per-sound voice picker.

   **Unheard**, all of it changed in response to feedback but never played back:

   - **Sci-Fi's carrier.** Called "crunchy and bleh"; its FM sat on a sawtooth
     and now sits on a sine, flatness 0.450 → 0.191. Ry was leaning toward
     cutting this preset, so it either lands now or it goes.
   - **The three rooms**, which used to be one room three times. Retro is now
     tight and bright, Sci-Fi dark and distant, Playful a discrete bounce.
   - **Bloopy's cutoff**, 720 → 1000 Hz. It had been filtering its own
     fundamental, which is what "slightly muddy" was.
   - **The nine-preset set as a set**, since Xylophone was cut.

2. **Two questions still unanswered**, both asked and never resolved:

   - Does `send` landing a **major second** below base read as "lower
     register"? The original spec said send/receive are the lower pair, and
     this is the highest they have sat. Dropping the pair a fourth is a
     one-line change if not.
   - Does **Crisp** read as a click rather than a short beep? Open since the
     first tuning round.

3. **The next lever, if the palette still is not wide enough:** a **filter
   envelope** — the one item on the spec's v2 list not yet built, and the
   classic pluck/wow character knob. Right now the filter only moves for
   `expand` and `collapse`.

4. **The no-JavaScript agent surface** — `middleware.ts` plus `api/`. `llms.txt`
   currently states plainly that a non-JS fetch gets the shell and that file;
   this is what makes that claim unnecessary. Verify with a real `curl`, not a
   browser — see the log entry for why that distinction has already bitten once.

5. **An OG card.** `index.html` deliberately ships no `og:image`, because an
   unfurl with a broken image renders a grey box. `twitter:card` is `summary`
   until one exists.

6. **The upstream manifest flip**, when Ry says it is ready: `wordmark`,
   `domain`, `status: "live"` on the `sound` entry in Ramps, plus that entry's
   blurb, which still promises a motion-coupling this tool does not do. Until
   then `familyAsText()` calls Beeps "not yet released" in the exported agent
   markdown on its own live site — the one place the deferral shows.

## Known blockers / open

- **The apex redirect is ours, not Vercel's.** Attaching both domains did NOT
  produce a redirect — both spellings served 200 independently, which splits
  the crawl and leaves the canonical tag pointing at one of two live URLs.
  `vercel.json` now 308s `beeps.studio` to `www.beeps.studio`, preserving path
  and query (share links depend on the query surviving). If a second domain is
  ever added, it needs its own rule.
- **`vercel domains inspect` still warns about nameservers.** Expected: the
  domain is configured with A/CNAME records at Squarespace rather than by
  delegating nameservers to Vercel. Both are supported; the warning is about
  the path not taken, not a misconfiguration.
- **Family prep is on branches, unpushed** — `family-prep-for-beeps` in both
  Ramps and Motion, carrying the shared `ExportPanel` binary channel, the
  missing sync scripts and the doc reconciliation.
- **The manifest blurb** still reads "Short interface sounds that agree with the
  motion they accompany", which promises motion-coupling that isn't in v1 scope.
  Left by agreement; revisit in the same edit that adds the domain.
- **Preset tuning is real work, not polish.** §18 step 7. The nine presets have
  considered starting numbers, but they get finished by ear.
