// ==============================================
// ENTRY POINT
// Mounts the app into #root and pulls in the global
// stylesheet.
//
// No analytics beacons, unlike Ramps and Motion.
// This tool's brief rules out analytics outright, and
// a page that generates sound is the last place to
// put a third-party script nobody asked for. Adding
// them later is two imports if the family ever wants
// parity.
// ==============================================
import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
