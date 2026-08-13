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
import { FieldLabel } from "./shared/components/Label"
import { useTheme } from "./shared/theme"
import Preview from "./components/Preview"
import BeepsExport from "./components/ExportPanel"
import SoundList from "./components/SoundList"
import AgentData from "./components/AgentData"
import PresetSelect from "./components/PresetSelect"
import { PRESETS, type PresetId } from "./lib/presets"
import type { SoundId } from "./lib/sounds"
import {
  DEFAULT_CONFIG,
  applyEdit,
  applyPreset,
  resolve,
  type SetConfig,
  type SoundDelta,
} from "./lib/resolve"
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
  // A set with any edit is no longer the preset — it is Custom, and switching
  // back would throw those edits away. PresetSelect asks before it does.
  // A sound given its own voice is as much an edit as a moved slider, and
  // switching presets throws both away — so both have to reach the
  // confirmation, or picking a new preset would silently discard the mixing.
  const editCount = new Set([
    ...Object.keys(config.deltas),
    ...Object.keys(config.presets ?? {}),
  ]).size

  const setPreset = useCallback((presetId: PresetId) => {
    // A preset applies to the whole set. Deltas are cleared, because they were
    // authored against different derived values and keeping them would produce
    // a set that is neither the old one nor the new preset.
    setConfig({ presetId, deltas: {} })
  }, [])

  // Every edit goes through applyEdit, so pair mirroring is never something a
  // caller has to remember. It is the only write path into `deltas`.
  const editSound = useCallback((id: SoundId, patch: SoundDelta) => {
    setConfig((current) => applyEdit(current, id, patch))
  }, [])

  // One sound's instrument, independent of the rest. Pitch stays global, so a
  // mixed set is still one key — see SetConfig.presets.
  const setSoundPreset = useCallback((id: SoundId, presetId: PresetId) => {
    setConfig((current) => applyPreset(current, id, presetId))
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
            <FieldLabel>Preset</FieldLabel>
            <PresetSelect
              value={config.presetId}
              isCustom={editCount > 0}
              editCount={editCount}
              onChange={setPreset}
            />
          </div>
          {/*
            The preset's blurb is in the dropdown, on every option — repeating
            it here described the choice you already made, next to the control
            that made it. What is NOT anywhere else is the edit count, so that
            is all this says now, and it disappears when there is nothing to
            count.
          */}
          {editCount > 0 && (
            <p className="text-ash max-w-[46ch] pb-2 text-sm leading-relaxed">
              {editCount} sound{editCount === 1 ? "" : "s"} edited on top of{" "}
              <span className="text-ink">{preset.name}</span>.
            </p>
          )}
        </div>
      }
      overlay={
        exporting ? (
          <ExportModal onClose={() => setExporting(false)}>
            <BeepsExport set={audio.set} url={shareUrl} warnings={warnings} config={config} />
          </ExportModal>
        ) : null
      }
    >
      {warnings.length > 0 && <Warnings items={warnings} />}

      {/*
        The set comes first. It was under the preview, and the editor was hard
        to find as a result — the page opened on six demo surfaces, with the
        thing you actually change buried below them. Output before playground.
      */}
      <SoundList
        set={audio.set}
        config={config}
        onEdit={editSound}
        onPreset={setSoundPreset}
        onPlay={audio.play}
      />

      <Preview
        play={audio.play}
        playOne={audio.playOne}
        playSequence={audio.playSequence}
        started={audio.started}
        muted={audio.muted}
      />

      {/* Always in the DOM, like Ramps and Motion. See AgentData. */}
      <AgentData set={audio.set} url={shareUrl} warnings={warnings} config={config} />
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
