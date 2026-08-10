// ==============================================
// VITE CONFIG
// Build and dev-server setup. Deliberately small,
// matching the rest of the family: the React and
// Tailwind plugins, and React deduping.
//
// `base: "./"` emits relative asset paths, so the
// built site works opened straight off disk as well
// as served. That is a stated constraint for this
// tool, not a nicety — the whole thing has to run
// from a file:// URL with no server at all.
// ==============================================
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    // Ensure a single React instance so libraries like `motion` don't resolve
    // their own nested copy (which breaks hooks: "Cannot read ... useContext").
    dedupe: ["react", "react-dom"],
  },
})
