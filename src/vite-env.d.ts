/// <reference types="vite/client" />

// The `?raw` import in lib/export.ts: the synthesis runtime ships its own
// source verbatim, so there is only ever one implementation.
declare module "*?raw" {
  const source: string
  export default source
}
