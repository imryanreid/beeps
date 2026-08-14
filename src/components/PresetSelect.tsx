// ==============================================
// PRESET SELECT
// The character dropdown, plus the "Custom" state a
// set falls into as soon as any sound is edited.
//
// Switching away from Custom throws work away, so it
// asks first — the one place in this tool that does.
// Everywhere else the family pattern is act-then-undo
// (see ResetButton), but that only works when the
// undo is visible for a few seconds afterwards, and
// this control's result is eleven sounds quietly
// reverting. Better to ask.
//
// A custom popover rather than a native <select>,
// mirroring Ramps' SchemeSelect: each option carries
// a line about what it sounds like, which a native
// option cannot show.
// ==============================================
import { useEffect, useRef, useState } from "react"
import { CaretDown, Check, Warning } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import { PRESETS, PRESET_IDS, type PresetId } from "../lib/presets"

export default function PresetSelect({
  value,
  isCustom,
  editCount,
  onChange,
}: {
  value: PresetId
  /** True once any sound carries an edit. */
  isCustom: boolean
  editCount: number
  onChange: (id: PresetId) => void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<PresetId | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Outside-click and Escape, the way every popover in the family dismisses.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false)
        setPending(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        setPending(null)
      }
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const choose = (id: PresetId) => {
    // Only ask when there is something to lose. Picking the preset you are
    // already on is a no-op either way.
    if (isCustom && editCount > 0) {
      setPending(id)
      return
    }
    onChange(id)
    setOpen(false)
  }

  const commit = (id: PresetId) => {
    onChange(id)
    setPending(null)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="border-line hover:border-ink/30 text-ink flex h-9 min-w-[150px] items-center justify-between gap-3 rounded-md border px-3 font-mono text-xs transition-colors"
      >
        <span>{isCustom ? "Custom" : PRESETS[value].name}</span>
        <CaretDown
          size={11}
          weight="bold"
          className={cn("text-ash shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="border-line bg-paper absolute top-full left-0 z-30 mt-1.5 w-[300px] rounded-lg border p-1 shadow-xl"
        >
          {isCustom && (
            <div className="border-line mb-1 border-b px-2.5 py-2">
              <p className="font-mono text-[11px]">Custom</p>
              <p className="text-ash mt-0.5 text-[11px] leading-relaxed">
                {editCount} sound{editCount === 1 ? "" : "s"} edited, built on{" "}
                {PRESETS[value].name}.
              </p>
            </div>
          )}

          {PRESET_IDS.map((id) => {
            const preset = PRESETS[id]
            const current = !isCustom && id === value
            const asking = pending === id
            return (
              <div key={id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={current}
                  onClick={() => choose(id)}
                  className={cn(
                    "hover:bg-ink/[0.04] w-full rounded px-2.5 py-2 text-left transition-colors",
                    asking && "bg-ink/[0.04]",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px]">{preset.name}</span>
                    {current && <Check size={12} weight="bold" className="text-ash shrink-0" />}
                  </span>
                  {/*
                    Name and description only. `suits` — "finance, health,
                    anything that should feel steady" — is still on the preset
                    and still ships in the agent payload, where a machine
                    choosing between nine characters has nothing else to go on.
                    In the menu it was a third line on every row, turning a
                    nine-item list into twenty-seven lines of prose to scan past
                    while listening.
                  */}
                  <span className="text-ash mt-0.5 block text-[11px] leading-relaxed">
                    {preset.blurb}
                  </span>
                </button>

                {asking && (
                  <div className="border-line mx-1 mb-1 rounded border border-dashed px-2.5 py-2">
                    <p className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed">
                      <Warning
                        size={12}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-amber-500"
                      />
                      <span>
                        Switching to {preset.name} discards your {editCount} edit
                        {editCount === 1 ? "" : "s"}. A preset regenerates the whole set.
                      </span>
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => commit(id)}
                        className="bg-ink text-paper rounded px-2.5 py-1 font-mono text-[11px]"
                      >
                        discard &amp; switch
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending(null)}
                        className="border-line hover:bg-ink/[0.04] rounded border px-2.5 py-1 font-mono text-[11px] transition-colors"
                      >
                        keep editing
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
