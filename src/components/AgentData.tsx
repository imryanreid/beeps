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
// It is a <details> for tidiness, NOT display:none.
// Readability-style extractors honour inline hiding
// and skip such content, which would make this
// invisible to exactly the readers it exists for —
// a `<details>` keeps the text in the document.
// ==============================================
import { CaretRight } from "@phosphor-icons/react"
import CopyText from "../shared/components/CopyText"
import { cn } from "../shared/utils"
import { toAgentMarkdown } from "../lib/export"
import type { SoundSet } from "../lib/sounds"

export default function AgentData({
  set,
  url,
  warnings,
}: {
  set: SoundSet
  url: string
  warnings: string[]
}) {
  const markdown = toAgentMarkdown(set, url, warnings)

  return (
    <details className="border-line group mt-12 rounded-lg border open:pb-4">
      <summary className="text-ash hover:text-ink flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-mono text-[11px] tracking-[0.16em] uppercase transition-colors">
        <CaretRight
          size={11}
          weight="bold"
          className={cn("shrink-0 transition-transform group-open:rotate-90")}
        />
        Machine-readable set (for agents)
      </summary>

      <div className="px-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-ash max-w-[70ch] text-sm leading-relaxed">
            The same markdown the Export panel emits — when to play each sound and when not to,
            the synthesis function, and the rules for adding a twelfth one. An agent cannot hear
            a WAV, so this is what the handoff actually is.
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
    </details>
  )
}
