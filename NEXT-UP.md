# Next Up

> **What this file is for:** Session handoff state — what was most recently
> built, what to do next, and known blockers. Read at the start of a session,
> update at the end. Previous sessions stay as a rolling log. Not a spec — see
> [`SPEC.md`](SPEC.md) for that, [`CLAUDE.md`](CLAUDE.md) for conventions and
> [`PROJECT_MAP.md`](PROJECT_MAP.md) for the file inventory.

## Current state

**v1 feature-complete, not yet deployed.** Everything in the v1 scope works:
the synth core, three presets, the eleven-sound set, semantic pairing,
rapid-fire preview, URL state, the per-sound editor with the spectrum rail, and
all six exports. 104 tests. Builds clean and runs from `file://`.

Not done: no domain, no Vercel project, no git remote, no agent surfaces
(`api/`, `llms.txt`, JSON-LD). And the presets have not been tuned by ear —
see below, it is the next real piece of work.

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

## Next

0. **Ry is writing per-sound shape/flavour definitions.** Those land next and
   supersede a chunk of the tuning below. Two things to know before folding
   them in: the _semantics_ are currently global (every preset shares the same
   intervals and directions) and only _character_ varies per preset — if a
   definition implies a sound's shape should differ BY preset, that is a real
   architectural change, not a tweak. And two rules are load-bearing unless
   argued out of: direction stays meaningful, and the duration window is a real
   constraint at both ends.

1. **Tune the nine presets by ear.** This is the piece that cannot be checked
   by a test and the thing the tool will be judged on. Every number is a
   considered starting point, not a finished one. Use rapid-fire at 120 ms as
   the acceptance test, and listen to `notification` on each — it is the
   longest sound in every preset and the first to feel wrong.

   Watch for two things the maths cannot catch: whether Warm's 9-cent beat is
   audible at these durations (a beat needs time to be heard, and these sounds
   are short), and whether Glassy's shortened tails still read as a bell now
   they had to come down to fit the 200ms budget.

2. **Register beeps.studio**, then land the domain commit — `CLAUDE.md` lists
   every file that has to change together, including the manifest entry and its
   blurb upstream in Ramps.
3. **Agent surfaces**: `middleware.ts` + `api/render` + `/api/sounds`,
   `llms.txt`, JSON-LD, `robots.txt`, `sitemap.xml`. Verify with a real
   no-JavaScript fetch — a browser check proves nothing there.
4. Favicon, app icons and an OG card.

## Known blockers / open

- **No domain.** `beeps.studio` isn't registered, so there's no canonical tag,
  `og:` block, JSON-LD, `robots.txt` or `sitemap.xml` yet. They land together in
  one commit when it does. `CLAUDE.md` lists every file that has to change.
- **No Vercel project yet** — comes after the repo is pushed.
- **No git remote yet.** The repo is initialised locally on `main` with no
  origin. Six commits, ready to push.
- **Family prep is on branches, unpushed** — `family-prep-for-beeps` in both
  Ramps and Motion, carrying the shared `ExportPanel` binary channel, the
  missing sync scripts and the doc reconciliation.
- **The manifest blurb** still reads "Short interface sounds that agree with the
  motion they accompany", which promises motion-coupling that isn't in v1 scope.
  Left by agreement; revisit in the same edit that adds the domain.
- **Preset tuning is real work, not polish.** §18 step 7. The three presets have
  considered starting numbers, but they get finished by ear.
