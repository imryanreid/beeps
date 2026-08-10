// ==============================================
// APP
// The page. Owns the sound set, keeps it in the URL,
// and hands the layout to ToolShell.
//
// Scaffold state: the shell renders with the theme
// toggle wired and nothing else. The synth, the
// preview and the export land on top of this, in the
// order SPEC.md §18 sets out.
// ==============================================
import ToolShell from "./shared/components/ToolShell"
import ThemeToggle from "./shared/components/ThemeToggle"
import { useTheme } from "./shared/theme"

/** Which entry in the shared tools manifest this repo is. */
const TOOL_ID = "sound"

export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <ToolShell
      toolId={TOOL_ID}
      title="UI Sound Generator"
      subtitle="A restrained set of interface sounds, synthesized in the browser and previewed on real UI. No audio files to host, and a handoff your agent can read."
      actions={<ThemeToggle theme={theme} onToggle={toggle} />}
    >
      <p className="text-ash text-sm leading-relaxed">
        Nothing here yet — the shell is up and the sounds land next.
      </p>
    </ToolShell>
  )
}
