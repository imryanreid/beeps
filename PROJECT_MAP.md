# Project Map

> **What this file is for:** What every file in this repo does, in plain
> language. Update it whenever files are created, renamed or moved. Not a spec —
> see [`SPEC.md`](SPEC.md) — and not a handoff log, which is
> [`NEXT-UP.md`](NEXT-UP.md).

## Root

| File                              | What it does                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`                      | The page shell. Sets the title and description, and runs the pre-paint theme script so a dark-mode visitor never sees a white flash. |
| `vite.config.ts`                  | Build setup. `base: "./"` so the built site runs from a `file://` URL.                                                               |
| `tsconfig.json`                   | TypeScript, `strict: true`, `noEmit` — Vite does the building.                                                                       |
| `package.json`                    | Scripts and dependencies. No audio packages; Web Audio is native.                                                                    |
| `.mise.toml`                      | Pins Node 22 and pnpm 10.34.3, matching the rest of the family.                                                                      |
| `.prettierrc` / `.prettierignore` | Formatting. `semi: false`, double quotes, `printWidth: 96`.                                                                          |
| `.gitignore`                      | Covers `node_modules`, `dist`, `.env*`, `.vercel` and `.claude/`.                                                                    |
| `LICENSE`                         | MIT.                                                                                                                                 |

## Docs

| File             | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `README.md`      | What Beeps is, for people. The public front door.                              |
| `CLAUDE.md`      | How to work in this repo — conventions, and the things that are easy to break. |
| `SPEC.md`        | What is being built and why every decision went the way it did.                |
| `PROJECT_MAP.md` | This file.                                                                     |
| `NEXT-UP.md`     | Session handoff: what was built, what's next, known blockers.                  |

## `src/`

| File        | What it does                                                                    |
| ----------- | ------------------------------------------------------------------------------- |
| `main.tsx`  | Mounts the app into `#root` and pulls in the stylesheet.                        |
| `App.tsx`   | The page. Owns the sound set, keeps it in the URL, hands layout to `ToolShell`. |
| `index.css` | Imports the shared token sheet. Tool-specific CSS goes below that import.       |

### `src/lib/` — the maths. Pure, framework-free, tested in Node.

_Not written yet. Planned shape, from [`SPEC.md` §15](SPEC.md):_

| File          | What it will do                                                                  |
| ------------- | -------------------------------------------------------------------------------- |
| `sounds.ts`   | The eleven-sound set: intervals, pairs, tiers.                                   |
| `presets.ts`  | Soft, Crisp and Minimal as declarative data — no code branches.                  |
| `resolve.ts`  | Preset + deltas → a complete `SoundSet`. The single source every consumer reads. |
| `loudness.ts` | A-weighted RMS, peak check, and the per-sound normalized gain.                   |
| `wav.ts`      | The RIFF/PCM encoder. Takes channels, sample rate and bit depth.                 |
| `params.ts`   | The URL codec. Readable short keys, deltas only, no base64.                      |
| `export.ts`   | Every export format, including the agent markdown.                               |
| `agent.ts`    | The machine-readable payload — JSON and text from one source.                    |

### `src/runtime/` — the synthesis runtime

| File       | What it will do                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `beeps.js` | Plain JS, no TypeScript syntax, no imports. The app runs it; the JS export ships its source verbatim, so there is only ever one implementation. |

### `src/components/` — rendering only, no maths

_Not written yet._ The editor, the six preview surfaces, the rapid-fire control,
the spectrum rail and the export panel wiring.

### `src/shared/` — the family layer

**Authored in [Ramps Studio](../Ramps%20Studio). Never edited here** — the next
`pnpm sync` overwrites it with `rsync --delete`. Holds the page shell, the tool
switcher and footer directory, the export modal and panel, the segmented
control, labels, icon buttons, copy affordances, the colour tokens, the motion
tokens and the theme hook.

## `scripts/`

| File             | What it does                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync-shared.sh` | Copies `src/shared/` from Ramps Studio, or diffs it with `--check`. Finds the family by filesystem path, which is why worktrees must live inside `Studio Tools/`. |

## `public/`

Empty so far. `robots.txt`, `sitemap.xml` and `llms.txt` land with the domain.
