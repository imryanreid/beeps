# Beeps

A single-page tool at [beeps.studio](https://beeps.studio) that generates a
coherent, restrained set of UI sounds — tap, toggle, success, error,
notification and the rest — and hands them over in a form both people and
coding agents can use. Built for **web and desktop apps** first, with the
guidance that mobile needs kept alongside.

**Every sound is synthesized in your browser.** Oscillators, envelopes and
filters. There is no sample library, no hosted audio, and nothing to license. A
whole sound set is a few dozen numbers, which is why it fits in a URL and why an
agent can reason about it.

Public, open source (MIT), and a portfolio piece. Third tool in the
**Studio Tools** family, after [Ramps](https://www.ramps.studio) and
[Springs](https://www.springs.studio).

> **Status: in development.** The shell and the shared layer are in place. See
> [`NEXT-UP.md`](NEXT-UP.md) for where things actually stand and
> [`SPEC.md`](SPEC.md) for what is being built.

## What it does

- **Nine character presets** — Soft, Minimal, Crisp, Warm, Bloopy, Glassy,
  Playful, Retro and Sci-Fi — each applying to the whole set at once, so it
  stays internally consistent rather than becoming eleven unrelated noises.
  Each one contributes its own voice stack: a detuned twin for Warm's beating,
  overtones that ring on for Glassy's bell, stacked fifths for Sci-Fi's zap.
- **A semantic system.** One base frequency; every sound derived at a musical
  interval from it, so nothing clashes. Paired sounds are generated from each
  other — toggle on and off are inversions, and stay that way when you edit
  either.
- **Preview on real UI.** A button, a toggle, a form, a notification card. Plus
  a rapid-fire test that triggers a sound ten times in a row, which is the
  fastest way to find out whether you can live with it.
- **Restraint by default.** The set is loudness-normalized so nothing spikes,
  and every export ships behind a mute gate that starts off. Length is budgeted
  **at both ends** per tier — too long overlaps the next interaction, and too
  short is inaudible however far you turn it up, because the ear needs roughly
  100–200 ms to register a sound properly.

## Export

| Format       | What you get                                                                        |
| ------------ | ----------------------------------------------------------------------------------- |
| **JS**       | A zero-dependency synthesis function plus your set as data. No audio assets at all. |
| **WAV**      | 16-bit mono PCM, rendered offline in the browser.                                   |
| **Data URI** | The same WAV, base64'd, for inlining with no network request.                       |
| **JSON**     | The full resolved parameter set.                                                    |
| **Markdown** | For a coding agent — see below.                                                     |
| **Native**   | WAV plus an `AVAudioPlayer` snippet.                                                |

No MP3, AAC or MP4, deliberately. Compression is pointless at this size, lossy
codecs smear exactly the sharp attacks this tool exists to tune, and both
formats prepend encoder-delay silence that can be longer than the sound itself.
[`SPEC.md` §12](SPEC.md) has the full argument.

## For agents

An agent cannot hear a WAV, so the markdown export carries the intent rather
than just the numbers: when to play each sound **and when not to**, the
synthesis function so it writes code instead of managing assets, the mute gate
stated as a requirement, and the relationships between sounds so it can add a
twelfth one that belongs.

## Running it

```bash
pnpm install
pnpm dev
```

```bash
pnpm build && pnpm test && pnpm sync:check
```

All three must be clean. The built site works opened straight off disk — there
is no server, no backend and nothing stored.

## The shared layer

`src/shared/` is authored in [Ramps Studio](../Ramps%20Studio) and copied here
byte-for-byte by `scripts/sync-shared.sh`. **Don't edit it here** — the next
sync silently reverts it. See [`CLAUDE.md`](CLAUDE.md).

## Licence

MIT. Fork it, change it, ship it.
