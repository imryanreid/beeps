# Next Up

> **What this file is for:** Session handoff state — what was most recently
> built, what to do next, and known blockers. Read at the start of a session,
> update at the end. Previous sessions stay as a rolling log. Not a spec — see
> [`SPEC.md`](SPEC.md) for that, [`CLAUDE.md`](CLAUDE.md) for conventions and
> [`PROJECT_MAP.md`](PROJECT_MAP.md) for the file inventory.

## Current state

**Scaffolded.** The repo exists, the shared layer is in, and the page shell
renders in light and dark — including opened straight off disk from
`dist/index.html`, which is the constraint that shapes the build. Nothing makes
a sound yet.

`SPEC.md` is written and approved. Build order is [§18](SPEC.md).

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

## Next

Straight into [`SPEC.md` §18](SPEC.md) step 4 — `src/lib/` with tests, before
any UI. That is where correctness lives, and it is all pure functions:
`sounds.ts`, `presets.ts`, `resolve.ts`, `loudness.ts`, `wav.ts`, `params.ts`.

Then the runtime and one button that fires `tap` (§18 step 5), which is the
first point anything is audible.

## Known blockers / open

- **No domain.** `beeps.studio` isn't registered, so there's no canonical tag,
  `og:` block, JSON-LD, `robots.txt` or `sitemap.xml` yet. They land together in
  one commit when it does. `CLAUDE.md` lists every file that has to change.
- **No Vercel project yet** — comes after the repo is pushed.
- **No git remote yet.** The repo is initialised locally on `main` with no
  origin.
- **The manifest blurb** still reads "Short interface sounds that agree with the
  motion they accompany", which promises motion-coupling that isn't in v1 scope.
  Left by agreement; revisit in the same edit that adds the domain.
- **Preset tuning is real work, not polish.** §18 step 7. The three presets have
  considered starting numbers, but they get finished by ear.
