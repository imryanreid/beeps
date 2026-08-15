// ==============================================
// PICKER
// One dropdown for the four plain lists in this tool:
// which sound to audition, which to fire, which voice
// a row uses, and which sound to export.
//
// Those were four native <select>s, which made them
// the only controls here that opened an OS menu in the
// app's own chrome and the only ones that could not
// animate. Two of them were also the same control
// twice — identical styling down to a duplicated
// inline SVG caret data-URI.
//
// Deliberately NOT the same component as PresetSelect.
// That one is custom because each option carries a
// line about what the preset sounds like, which a
// native <option> cannot render, and because switching
// away from Custom has to ask first. This one is a
// plain list of labels. Merging them would drag a
// confirmation flow and a description column into four
// places that want neither.
//
// Dismissal is outside-click plus Escape, matching
// PresetSelect and the family's other popovers — two
// dropdowns in one app should not behave differently.
// ==============================================
import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CaretDown, Check } from "@phosphor-icons/react"
import { cn } from "../shared/utils"
import { POPOVER, POPOVER_ORIGIN } from "../shared/motion"

export type PickerOption<T extends string> = {
  id: T
  label: string
  /** Shown dimmed after the label, e.g. "(set)". Never the only difference. */
  note?: string
}

export default function Picker<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  triggerClassName,
  /** The export terminal stays dark in light mode, so it needs its own chrome. */
  tone = "paper",
  trigger,
}: {
  value: T
  options: PickerOption<T>[]
  onChange: (id: T) => void
  ariaLabel: string
  /** Each call site keeps its own trigger chrome; this owns behaviour and the menu. */
  triggerClassName?: string
  tone?: "paper" | "terminal"
  /** Override the trigger's label. Defaults to the selected option's label. */
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.id === value)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const terminal = tone === "terminal"

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn("inline-flex items-center gap-1.5", triggerClassName)}
      >
        {trigger ?? current?.label ?? value}
        <CaretDown
          size={10}
          weight="bold"
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            {...POPOVER}
            className={cn(
              // max-h + scroll because the sound list is eleven long and this
              // can open near the bottom of a preview card.
              "absolute top-full left-0 z-30 mt-1.5 max-h-64 min-w-full overflow-y-auto rounded-md border shadow-xl",
              terminal ? "border-white/15 bg-[#16150f]" : "border-line bg-paper",
              POPOVER_ORIGIN,
            )}
          >
            {options.map((o) => {
              const selected = o.id === value
              return (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(o.id)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left font-mono text-[11px] whitespace-nowrap transition-colors",
                    terminal ? "text-paper hover:bg-white/10" : "hover:bg-ink/[0.04]",
                    !terminal && (selected ? "text-ink" : "text-ash"),
                  )}
                >
                  <span>
                    {o.label}
                    {o.note && <span className="opacity-50"> {o.note}</span>}
                  </span>
                  {selected && (
                    <Check
                      size={11}
                      weight="bold"
                      aria-hidden="true"
                      className={terminal ? "text-paper" : "text-ink"}
                    />
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
