// ==============================================
// APP
// The page. Owns the config, keeps it in the URL,
// hands the layout to ToolShell.
//
// The config is the only state: everything visible is
// a pure function of it, resolved once and passed
// down. Nothing below here recomputes a frequency.
// ==============================================
import { useCallback, useEffect, useMemo, useState } from "react"
import { DownloadSimple, SpeakerSimpleHigh, SpeakerSimpleSlash } from "@phosphor-icons/react"
import ToolShell from "./shared/components/ToolShell"
import ThemeToggle from "./shared/components/ThemeToggle"
import IconButton from "./shared/components/IconButton"
import ResetButton from "./shared/components/ResetButton"
import ShareButton from "./shared/components/ShareButton"
import ExportModal from "./shared/components/ExportModal"
import Segmented from "./shared/components/Segmented"
import { FieldLabel } from "./shared/components/Label"
import { useTheme } from "./shared/theme"
import Preview from "./components/Preview"
import BeepsExport from "./components/ExportPanel"
import { PRESETS, PRESET_IDS, type PresetId } from "./lib/presets"
import { DEFAULT_CONFIG, resolve, type SetConfig } from "./lib/resolve"
import { decodeWarnings, encodeConfig, resolveConfig } from "./lib/params"
import { useAudio } from "./lib/useAudio"

/** Which entry in the shared tools manifest this repo is. */
const TOOL_ID = "sound"

export default function App() {
  const { theme, toggle } = useTheme()

  // The URL is the only persistence. Read once at mount; written back on every
  // change. Not read continuously — that would fight the user's own edits.
  const [config, setConfig] = useState<SetConfig>(() =>
    typeof window === "undefined" ? DEFAULT_CONFIG : resolveConfig(window.location.search),
  )
  const [warnings] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : decodeWarnings(window.location.search),
  )
  /** What Reset threw away, so its undo has something to put back. */
  const [previous, setPrevious] = useState<SetConfig | null>(null)
  const [exporting, setExporting] = useState(false)

  // Resolving is cheap and pure, but it must be memoised: useAudio re-measures
  // the whole set whenever this object's identity changes, and a fresh object
  // every render would re-render eleven sounds offline on every keystroke.
  const rawSet = useMemo(() => resolve(config), [config])
  const audio = useAudio(rawSet)

  // Keep the address bar in step, without adding a history entry per keystroke.
  useEffect(() => {
    if (typeof window === "undefined") return
    const query = encodeConfig(config)
    const url = query ? `${window.location.pathname}?${query}` : window.location.pathname
    window.history.replaceState(null, "", url)
  }, [config])

  const preset = PRESETS[config.presetId]

  const setPreset = useCallback((presetId: PresetId) => {
    // A preset applies to the whole set. Deltas are cleared, because they were
    // authored against different derived values and keeping them would produce
    // a set that is neither the old one nor the new preset.
    setConfig({ presetId, deltas: {} })
  }, [])

  const shareUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${window.location.pathname}${
          encodeConfig(config) ? `?${encodeConfig(config)}` : ""
        }`

  return (
    <ToolShell
      toolId={TOOL_ID}
      title="UI Sound Generator"
      subtitle="A restrained set of interface sounds, synthesized in the browser and previewed on real UI. No audio files to host, and a handoff your agent can read."
      actions={
        <>
          <IconButton
            title={audio.muted ? "Unmute" : "Mute"}
            onClick={() => audio.setMuted(!audio.muted)}
          >
            {audio.muted ? (
              <SpeakerSimpleSlash size={17} weight="regular" />
            ) : (
              <SpeakerSimpleHigh size={17} weight="regular" />
            )}
          </IconButton>
          <ThemeToggle theme={theme} onToggle={toggle} />
          {/* Reset morphs into its own undo for a few seconds — the family
              pattern. `previous` is what that undo restores. */}
          <ResetButton
            onReset={() => {
              setPrevious(config)
              setConfig(DEFAULT_CONFIG)
            }}
            onUndo={() => previous && setConfig(previous)}
          />
          <ShareButton url={shareUrl} />
          <IconButton title="Export sounds" variant="solid" onClick={() => setExporting(true)}>
            <DownloadSimple size={17} weight="regular" />
          </IconButton>
        </>
      }
      controls={
        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          <div>
            <FieldLabel>Character</FieldLabel>
            <Segmented
              value={config.presetId}
              onChange={setPreset}
              layoutId="preset-pill"
              ariaLabel="Character preset"
              options={PRESET_IDS.map((id) => ({
                id,
                label: PRESETS[id].name,
                title: PRESETS[id].blurb,
              }))}
            />
          </div>
          <p className="text-ash max-w-[46ch] pb-2 text-sm leading-relaxed">{preset.blurb}</p>
        </div>
      }
      overlay={
        exporting ? (
          <ExportModal onClose={() => setExporting(false)}>
            <BeepsExport set={audio.set} url={shareUrl} warnings={warnings} />
          </ExportModal>
        ) : null
      }
    >
      {warnings.length > 0 && <Warnings items={warnings} />}

      <Preview
        play={audio.play}
        playSequence={audio.playSequence}
        started={audio.started}
        muted={audio.muted}
      />
    </ToolShell>
  )
}

/**
 * What a mangled link lost.
 *
 * Shown rather than swallowed: a link that decoded to *something* renders a
 * completely coherent set, and without this there is no way to tell it is not
 * the set that was shared.
 */
function Warnings({ items }: { items: string[] }) {
  return (
    <div className="border-line bg-ink/[0.03] mb-8 rounded-lg border p-4">
      <p className="mb-2 font-mono text-[11px] tracking-[0.16em] uppercase">
        This link did not arrive intact
      </p>
      <ul className="text-ash space-y-1 text-sm leading-relaxed">
        {items.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  )
}
