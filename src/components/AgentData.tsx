// ==============================================
// AGENT DATA
// The whole set as plain text, at the bottom of the
// page, in the DOM whether or not anyone opens it.
//
// This is the family pattern: machine-readability is
// a visible design surface, not a hidden endpoint.
// Ramps has it, Motion has it, and it is how an agent
// that follows a shared link reads the set without
// running JavaScript or finding the export modal.
//
// It collapses for tidiness, NOT with display:none.
// Readability-style extractors honour inline hiding
// and skip such content, which would make this
// invisible to exactly the readers it exists for.
// This was a <details> for that reason; it is now a
// button plus a height-animated box that is ALWAYS
// mounted, which preserves the same property — the
// nodes stay in the document, they are merely not
// painted — while being able to animate, which
// <details> cannot.
// ==============================================
import { useState } from "react"
import { motion } from "motion/react"
import { CaretRight } from "@phosphor-icons/react"
import CopyText from "../shared/components/CopyText"
import { cn } from "../shared/utils"
import { DUR, EASE_PANEL } from "../shared/motion"
import { toAgentMarkdown } from "../lib/export"
import type { SetConfig } from "../lib/resolve"
import type { SoundSet } from "../lib/sounds"

export default function AgentData({
  set,
  url,
  warnings,
  config,
}: {
  set: SoundSet
  url: string
  warnings: string[]
  config?: SetConfig
}) {
  // Collapsed by default: this block is for agents, and a wall of markdown
  // above the fold is not what a person came for.
  const [open, setOpen] = useState(false)
  const markdown = toAgentMarkdown(set, url, warnings, config)

  return (
    <div className="border-line mt-12 rounded-lg border">
      {/*
        A button plus AnimatePresence rather than <details>. Native <details>
        cannot be animated — its content is display:none when closed, so there is
        nothing to transition from and it pops, while the caret rotated and drew
        attention to the fact that nothing else did.

        Losing <details> costs agents nothing: anything fetching this URL reads a
        separate payload that api/render injects into the HTML, so collapsing this
        one has never been what keeps the set machine-readable. Checked against
        production rather than assumed.
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="agent-set"
        className="text-ash hover:text-ink flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left font-mono text-[11px] tracking-[0.16em] uppercase transition-colors"
      >
        <CaretRight
          size={11}
          weight="bold"
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", open && "rotate-90")}
        />
        Machine-readable set (for agents)
      </button>

      {/*
            Always mounted, height-animated — never unmounted.
          
            main.tsx removes the block api/render injects the moment React
            takes over, so once the app is running THIS is the only copy of
            the machine-readable text in the document. An {open && …} here
            would delete it outright for anything that runs JavaScript and
            then reads the DOM.
          
            A <details> kept its content in the document while collapsed, and
            height:0 with overflow:hidden does the same: the nodes stay, they
            are merely not painted. That is the property being preserved, not
            the element.
          */}
      <motion.div
        id="agent-set"
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: DUR.panel, ease: EASE_PANEL }}
        className="overflow-hidden"
        aria-hidden={!open}
      >
        <div className="px-4 pb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-ash max-w-[70ch] text-sm leading-relaxed">
              The same markdown the Export panel emits — when to play each sound and when not
              to, the synthesis function, and the rules for adding a twelfth one. An agent
              cannot hear a WAV, so this is what the handoff actually is.
            </p>
            <CopyText
              value={markdown}
              title="Copy the markdown"
              swapOnCopy
              className="border-line hover:bg-ink/[0.04] shrink-0 rounded border px-2.5 py-1 font-mono text-[11px] transition-colors"
            >
              copy
            </CopyText>
          </div>
          <pre className="border-line bg-ink/[0.02] max-h-[50vh] overflow-auto rounded-md border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {markdown}
          </pre>
        </div>
      </motion.div>
    </div>
  )
}
