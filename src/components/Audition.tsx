// ==============================================
// AUDITION
// One sound, played across all nine presets back to
// back, with the current one lit as it goes.
//
// Built for tuning. Comparing presets by switching
// the dropdown, scrolling back and hitting play is
// slow enough that you test fewer variations than you
// meant to — and preset character is precisely the
// thing you can only judge against its siblings.
// Hearing the whole family in five seconds is what
// makes "does Crisp actually sound crisper than Soft"
// answerable.
//
// This is the deferred A/B compare, landed early and
// widened to the whole set, because the preset pass
// needed it.
// ==============================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play } from "@phosphor-icons/react"
import { Label } from "../shared/components/Label"
import { cn } from "../shared/utils"
import { HOVER_LIFT } from "../shared/motion"
import { PRESETS, PRESET_IDS, type PresetId } from "../lib/presets"
import { resolve, soundingMs } from "../lib/resolve"
import { canRender, normalizeSet } from "../lib/render"
import { SOUND_IDS, type Sound, type SoundId } from "../lib/sounds"

/** Silence between presets. Long enough to hear each as its own thing. */
const GAP_MS = 260

export default function Audition({
  soundId,
  onSoundId,
  playOne,
}: {
  soundId: SoundId
  onSoundId: (id: SoundId) => void
  playOne: (sound: Sound) => void
}) {
  const [playing, setPlaying] = useState<PresetId | null>(null)
  const [ready, setReady] = useState<Partial<Record<PresetId, Sound>>>({})
  const timers = useRef<number[]>([])

  // Every preset's version of this one sound, levelled the way it would
  // actually ship. Comparing un-normalized sets would mostly compare their
  // gain tables, which is the least interesting difference between them.
  const raw = useMemo(
    () =>
      Object.fromEntries(
        PRESET_IDS.map((id) => [
          id,
          resolve({ presetId: id, deltas: {} }).sounds.find((s) => s.id === soundId)!,
        ]),
      ) as Record<PresetId, Sound>,
    [soundId],
  )

  useEffect(() => {
    if (!canRender()) {
      setReady(raw)
      return
    }
    let current = true
    setReady({})
    Promise.all(
      PRESET_IDS.map(async (id) => {
        const set = await normalizeSet(resolve({ presetId: id, deltas: {} }))
        return [id, set.sounds.find((s) => s.id === soundId)!] as const
      }),
    )
      .then((pairs) => current && setReady(Object.fromEntries(pairs)))
      .catch(() => current && setReady(raw))
    return () => {
      current = false
    }
  }, [soundId, raw])

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    setPlaying(null)
  }, [])

  useEffect(() => clear, [clear])

  const run = useCallback(() => {
    clear()
    let at = 0
    for (const id of PRESET_IDS) {
      const sound = ready[id] ?? raw[id]
      const when = at
      timers.current.push(
        window.setTimeout(() => {
          setPlaying(id)
          playOne(sound)
        }, when),
      )
      // Each preset gets its own length plus a gap, so a long one is not
      // trampled by the next and a short one does not leave dead air.
      at += soundingMs(sound) + GAP_MS
    }
    timers.current.push(window.setTimeout(() => setPlaying(null), at))
  }, [clear, ready, raw, playOne])

  return (
    <div className="border-line rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Label className="mb-0">Across presets</Label>
        <span className="text-ash font-mono text-[11px]">{PRESET_IDS.length}x</span>
      </div>
      <p className="text-ash mb-4 text-sm leading-relaxed">
        The same sound in every character, back to back. Preset character only means anything
        against its siblings.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={soundId}
          onChange={(e) => onSoundId(e.target.value as SoundId)}
          aria-label="Sound to audition"
          className="border-line bg-paper text-ink hover:border-ink/30 h-9 appearance-none rounded-md border px-3 pr-7 font-mono text-[11px] transition-colors"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' fill='none' stroke='%236b6a63' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
          }}
        >
          {SOUND_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={run}
          className={cn(
            "bg-ink text-paper inline-flex h-9 items-center gap-2 rounded-md px-4 font-mono text-[11px] shadow-sm",
            HOVER_LIFT,
          )}
        >
          <Play size={12} weight="fill" />
          {playing ? "playing" : "play all"}
        </button>
      </div>

      {/* The running order, lit as it goes. Also clickable, for going back to
          the one that sounded wrong without replaying the other eight. */}
      <ul className="flex flex-wrap gap-1">
        {PRESET_IDS.map((id) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => {
                clear()
                setPlaying(id)
                playOne(ready[id] ?? raw[id])
                timers.current.push(window.setTimeout(() => setPlaying(null), 700))
              }}
              title={`Play ${PRESETS[id].name} only`}
              className={cn(
                "rounded border px-2 py-1 font-mono text-[10px] transition-colors",
                playing === id
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-ash hover:border-ink/30 hover:text-ink",
              )}
            >
              {PRESETS[id].name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
