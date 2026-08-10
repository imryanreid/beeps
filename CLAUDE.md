# CLAUDE.md — Beeps

> **What this file is for:** How we work together on _this_ project — stack,
> conventions, and the rules specific to it. Global preferences live in
> `~/CLAUDE.md`; where the two conflict, this file wins. For what each file
> does, see [`PROJECT_MAP.md`](PROJECT_MAP.md). For where we left off, see
> [`NEXT-UP.md`](NEXT-UP.md). For what is being built and why, see
> [`SPEC.md`](SPEC.md). For the visual language, see
> [`DESIGN-LANGUAGE.md`](../Ramps%20Studio/DESIGN-LANGUAGE.md) in Ramps Studio.

## What this is

A single-page tool that generates a coherent set of UI sounds — synthesized in
the browser with Web Audio, never sampled — and exports them as WAV, an inline
data URI, a zero-dependency synthesis function, JSON, or markdown that tells a
coding agent when to play what.

Third tool in the **Studio Tools** family, after
[Ramps Studio](../Ramps%20Studio) and [Motion Studio](../Motion%20Studio).
Public, open source (MIT), and a portfolio piece.

## Three names, and only three

Ramps got into trouble with four names in circulation, so this is settled up
front:

- **Beeps** — the brand. `og:site_name`, `llms.txt`, the agent payload, the
  manifest entry, this file's title.
- **UI Sound Generator** — the product. The in-app `<h1>`.
- **UI sounds & feedback** — the shelf label. The manifest `title`, and what the
  switcher and footer directory show.

The repo folder is `Sound Studio` and the manifest id is `sound`, both of which
stay as they are — exactly the split Motion already has, where the folder is
`Motion Studio`, the id is `motion` and the shelf label is "Springs". Don't
collapse them and don't add a fourth.

## Stack

React 19 · Vite 8 · Tailwind CSS v4 · TypeScript (strict) · Motion · pnpm ·
deployed on Vercel. Same as Motion Studio, minus the analytics packages.

**Zero audio dependencies.** Web Audio is native, the WAV encoder is
hand-written, base64 is `btoa`. Nothing in the spec justifies a package — if
that changes, ask first.

**No database, no state, no auth.** Every sound set is a pure function of the
URL.

## The constraint that shapes everything

**The client bundle alone is the complete tool.** `base: "./"` is set, so the
built site runs opened from a `file://` URL with no server at all. Verify it
after any build-config change:

```bash
pnpm build && open dist/index.html
```

Vercel Functions may be added later — as in Ramps and Motion — purely so agents
that don't run JavaScript can read a share link. They are strictly additive.
Nothing in `api/` may ever read or write persistent state, so every response
stays cacheable forever, and nothing there may become load-bearing for a human
visitor.

## `src/shared/` is not ours to edit

That directory is authored in **Ramps Studio** and copied here byte-for-byte.
Editing it locally means the next sync silently reverts your change — no
conflict, no warning.

```bash
pnpm sync          # pull the latest shared layer from Ramps Studio
pnpm sync:check    # diff only; exits non-zero on drift
```

To change something shared, change it in Ramps Studio and run `pnpm sync` here.
If a shared component needs behaviour specific to this tool, give it a **prop** —
never a branch on which tool is running. `src/shared/` must never import from
`src/lib/` or `src/components/`; one direction only, and that rule is what keeps
the copy mechanical.

Run `pnpm sync:check` before any release.

Worktrees go **inside `Studio Tools/`**, because `scripts/sync-shared.sh`
resolves the family by filesystem path rather than by git:

```bash
git worktree add "../Sound Studio-feature-x" -b feature-x origin/main
```

## Conventions

Inherited from the family, and they matter more here because three repos share
code:

- **Every file opens with a comment block** explaining what it does in plain
  language, in the banner style used across `src/`.
- **Class names go through `cn()`** (`src/shared/utils.ts`) whenever there's a
  conditional. Static class strings can stay inline.
- **Fonts are self-hosted** via Fontsource. Never a font CDN.
- **Maths belongs in `src/lib/`**, not in components. Components render; `lib/`
  decides.
- **`src/lib/` imports carry explicit `.js` extensions** so Vercel Functions can
  import them later without a rewrite. `src/components/` imports don't.
- **Durations, easings and springs come from `src/shared/motion.ts`.** Never a
  hardcoded timing.

## The things that will be easy to break

**1. One resolve, many readers.** `src/lib/resolve.ts` turns a preset plus
deltas into a complete `SoundSet` with every frequency computed and every
`normalizedGain` filled in. Live playback, the offline WAV render, the JS
export, the JSON and the markdown all read _that object_. No consumer
recomputes anything, and there is never a second serialization. This is what
guarantees the file you download is the sound you heard — the single most likely
way this tool ends up lying to people is a second code path for offline
rendering.

**2. No module-level state.** No module-scope `AudioContext`, no module-scope
"current set". The context is created once and passed in; the set is a plain
value passed in. Two sets must be instantiable side by side without anything
global tearing — that is what v2's A/B compare needs, and it is what keeps
`lib/` testable in Node.

**3. Loudness normalization is precomputed, never in the playback path.** It
produces one number per sound at resolve time. If it ever runs during playback,
rapid-fire and the exported file drift apart.

**4. The URL contract.** Once `?` params ship they are a public API — a shared
link has to keep working. Document them in `README.md`, `public/llms.txt`, the
JSON-LD in `index.html`, and any on-page legend, and change all of them
together. No base64: the params are readable and hand-editable on purpose, so an
agent can construct one. See [`SPEC.md` §14](SPEC.md).

**5. Machine-readability.** Being consumable by agents is a stated goal for
every tool in this family, not a nice-to-have. `robots.txt` stays permissive,
the JSON-LD stays accurate, and the page keeps rendering its full set as plain
text in the DOM. Don't move that behind an interaction.

**6. Sound is off until asked for.** Nothing this tool produces autoplays, and
every export ships behind a mute gate that defaults to muted. The tool itself
has sound on — that is the point of the tool — but those are different defaults
for different reasons and they must not be collapsed into one.

## Audio rules that are easy to get wrong

Each of these has an audible failure mode, and none of them will fail a build:

- Attack ramps **linearly from a true zero**. `exponentialRampToValueAtTime`
  cannot start at zero and silently does nothing.
- Decay and release ramp **exponentially toward an epsilon** (`0.0001`), then a
  final ~2 ms **linear ramp to true zero**. An exponential never arrives, and
  cutting a node at non-zero amplitude clicks.
- Frequency sweeps are **exponential**, clamped to ≥ 20 Hz. A linear Hz sweep
  spends most of its time in the top half and sounds wrong.
- **Nodes are per-trigger and disposed on `ended`.** `OscillatorNode` is
  single-use; rapid-fire must not leak them.
- Rapid-fire **overlaps** voices rather than cutting them off, with a polyphony
  cap of 16. Cutting off hides the exact problem the test exists to find.

## No domain yet

`beeps.studio` is not registered. Until it is, there is no canonical tag, no
`og:` block and no JSON-LD — a canonical pointing at a host that doesn't resolve
tells crawlers to prefer a URL that 404s, which is worse than saying nothing.
The manifest entry in **Ramps Studio** carries no `wordmark` or `domain` and is
`status: "soon"` for the same reason.

When the domain lands, these change together in one commit: `src/lib/site.ts`,
`index.html` (canonical, `og:url`, JSON-LD), `public/robots.txt`,
`public/sitemap.xml`, `public/llms.txt`, and the manifest entry upstream — plus
that entry's `blurb`, which still describes a motion-coupling this tool doesn't
do.

## Pushing

Once this is live on a custom domain it follows the family rule: **branch, push,
Vercel preview, Ryan looks, then merge.** Before a domain exists the rule is
relaxed, as it was for Motion on its `*.vercel.app` placeholder.

## Ask before

- Adding, removing, or upgrading any dependency.
- Touching `.env` files (there are none — this app needs no secrets).
- Adding state anywhere: a database, a session, a write path.

## Verify before calling it done

```bash
pnpm build && pnpm test && pnpm sync:check
```

`build` runs `tsc --noEmit` then Vite. All three must be clean. For visual
changes, load the page and check light _and_ dark. For anything touching audio,
**listen to it** — no test asserts that a sound is pleasant, and rapid-fire is
the check that matters.
