// ==============================================
// EXPORT PANEL
// This tool's formats, handed to the family's shared
// panel. The chrome, the code-vs-prompt fork and the
// dark terminal are all inherited; only the tabs and
// what they emit belong here.
//
// Three tabs are whole-set (JS, JSON, Markdown) and
// three are per-sound (WAV, Data URI, Native). The
// per-sound ones share one selector in the panel's
// own options bar, which is what makes "eleven files,
// one file per tab" coherent without a zip: you pick
// a sound and the filename, preview and download all
// follow it.
// ==============================================
import { useEffect, useState } from "react"
import ExportPanel, { type ExportFormat } from "../shared/components/ExportPanel"
import { toAgentMarkdown, toJson, toJs, toNative } from "../lib/export"
import { canRender, encodeSound, type EncodedSound } from "../lib/render"
import { SOUND_IDS, type SoundId, type SoundSet } from "../lib/sounds"

const KB = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

export default function BeepsExport({
  set,
  url,
  warnings,
}: {
  set: SoundSet
  url: string
  warnings: string[]
}) {
  const [soundId, setSoundId] = useState<SoundId>("tap")
  const [encoded, setEncoded] = useState<EncodedSound | null>(null)
  const [failed, setFailed] = useState(false)

  const sound = set.sounds.find((s) => s.id === soundId) ?? set.sounds[0]

  // Rendering is async, so a slow render of a previously selected sound can
  // land after a newer one. The guard is what stops the panel showing one
  // sound's bytes under another's name.
  useEffect(() => {
    if (!canRender()) {
      setFailed(true)
      return
    }
    let current = true
    setEncoded(null)
    setFailed(false)
    encodeSound(sound)
      .then((result) => current && setEncoded(result))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [sound])

  const picker = (
    <label className="flex items-center gap-2 font-mono text-[11px] text-white/45">
      sound
      <select
        value={soundId}
        onChange={(e) => setSoundId(e.target.value as SoundId)}
        className="text-paper rounded border border-white/15 bg-transparent px-1.5 py-0.5 font-mono text-[11px]"
      >
        {SOUND_IDS.map((id) => (
          <option key={id} value={id} className="text-ink bg-paper">
            {id}
          </option>
        ))}
      </select>
    </label>
  )

  /** Binary tabs share this: a readable summary, since a WAV in a <pre> is noise. */
  const summary = (label: string, extra?: string): string => {
    if (failed) {
      return `${label} could not be rendered.\n\nThis browser did not provide an OfflineAudioContext, which is what turns the parameters into samples. The JS and JSON tabs do not need it.`
    }
    if (!encoded) return `Rendering ${sound.id}…`
    return [
      `${sound.id}.wav`,
      "",
      `  duration     ${Math.round(encoded.durationMs)} ms`,
      `  sample rate  44100 Hz`,
      `  format       16-bit PCM, mono`,
      `  size         ${KB(encoded.bytes.length)} (${encoded.bytes.length} bytes)`,
      `  peak         ${(20 * Math.log10(Math.max(encoded.peak, 1e-6))).toFixed(1)} dBFS`,
      "",
      extra ?? `Press download for the file itself. Binary in a text panel is noise.`,
    ].join("\n")
  }

  const formats: ExportFormat[] = [
    {
      id: "js",
      label: "JS",
      filename: "beeps.js",
      mime: "text/javascript",
      render: () => toJs(set, url),
      fidelity: {
        summary: "Zero assets, zero requests",
        detail:
          "The synthesis runtime plus this set as data. Nothing is fetched at runtime and there are no audio files to host. This is the export to reach for on the web.",
      },
    },
    {
      id: "wav",
      label: "WAV",
      filename: `${sound.id.replace(".", "-")}.wav`,
      mime: "audio/wav",
      render: () => summary("This sound"),
      bytes: () => encoded?.bytes ?? new Uint8Array(),
      options: picker,
      fidelity: {
        summary: "One file per sound — no zip yet",
        detail:
          "Pick a sound above and download it. A zip of the whole set is deferred; eleven downloads is tedious but honest, and the JS export needs no files at all.",
      },
    },
    {
      id: "datauri",
      label: "Data URI",
      filename: `${sound.id.replace(".", "-")}.txt`,
      mime: "text/plain",
      render: () => (failed || !encoded ? summary("This sound") : encoded.dataUri),
      options: picker,
      fidelity: encoded
        ? {
            summary: `${KB(encoded.dataUri.length)} inlined — base64 costs a third`,
            detail: `The WAV is ${KB(encoded.bytes.length)}; base64 encodes three bytes as four, so inlining it costs ${KB(encoded.dataUri.length)}. Worth it to avoid a network request, and worth knowing before you paste eleven of them into a bundle.`,
          }
        : undefined,
    },
    {
      id: "json",
      label: "JSON",
      filename: "beeps.json",
      mime: "application/json",
      render: () => toJson(set, url),
    },
    {
      id: "markdown",
      label: "Markdown",
      filename: "ui-sounds.md",
      mime: "text/markdown",
      render: () => toAgentMarkdown(set, url, warnings),
      fidelity: {
        summary: "Carries intent, not just parameters",
        detail:
          "An agent cannot hear a WAV, so this says when to play each sound and when not to, states the mute gate as a requirement, and describes the relationships well enough that it can add a twelfth sound that belongs.",
      },
    },
    {
      id: "native",
      label: "Native",
      filename: `Beeps.swift`,
      mime: "text/plain",
      render: () => toNative(sound, url),
      options: picker,
      fidelity: {
        summary: "Needs the WAV from the tab beside it",
        detail:
          "iOS has no Web Audio, so the native path is a bundled file plus AVAudioPlayer. The snippet uses the .ambient session category so UI sound never interrupts someone's music.",
      },
    },
  ]

  return (
    <ExportPanel
      formats={formats}
      agentPrompt={agentPrompt(url)}
      codeBlurb="A zero-dependency synthesis function, WAV files, inline data URIs, JSON, or markdown for an agent. Copy or download."
    />
  )
}

function agentPrompt(url: string): string {
  return `Open ${url} and read the "UI sounds" block on the page — or fetch the same set as markdown from the Export panel.

It describes a complete set of eleven interface sounds: what each one is for, when to play it, and just as importantly when not to. Everything is synthesized with Web Audio, so there are no audio files to add to the project and nothing to license.

Please:
1. Take the JS export and add it to the project. It is the synthesis runtime plus the set as data — do not build an asset pipeline, there are no assets.
2. Wire the sounds to the events described, following the "When NOT to" column strictly.
3. Ship the global mute gate defaulting to OFF, persisted per user, enabled only from a real user gesture. Nothing plays until someone opts in.`
}
