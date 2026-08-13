# Rebuilding `public/og.png`

The share card is a **static** 1200×630 PNG, drawn on a canvas in the running
app so it uses the site's real fonts and the site's real audio.

## Why it is not a Vercel function

Ramps renders its card per-request from `/api/og`, because a palette *is*
colours and the card can show yours. A sound set does not unfurl that way —
every set would produce a near-identical picture — and a dynamic card would
mean adding `@vercel/og` for no visible gain. Static is the right trade here.

## Why it is not a script

It needs three things that only exist in a browser: the Fontsource faces the
site actually loads, an `OfflineAudioContext` to render the waveforms, and a
Canvas 2D context to draw them. A headless script would have to reimplement or
stub all three, and the result would be a picture of something other than what
the tool produces. Drawing it in the app is what keeps the waveforms *real*
rather than decorative.

## How

Start the dev server, open it, and run this in the console. It renders the four
sounds through the same `renderSound` the WAV export uses, so the curves on the
card are the actual audio.

```js
await document.fonts.ready
const R = await import('/src/lib/render.ts')
const V = await import('/src/lib/resolve.ts')

const W = 1200, H = 630
const PAPER = "#fdfdfc", INK = "#16150f", ASH = "#6b6a63", BLUE = "#3d7dff"
const c = document.createElement('canvas'); c.width = W; c.height = H
const g = c.getContext('2d')
g.fillStyle = PAPER; g.fillRect(0, 0, W, H)

// Eyebrow, letterspaced by hand — canvas has no letter-spacing.
g.fillStyle = ASH
g.font = '400 20px "JetBrains Mono", monospace'
let x = 72
for (const ch of "BEEPS.STUDIO") { g.fillText(ch, x, 172); x += g.measureText(ch).width + 6 }

g.fillStyle = INK
g.font = '700 76px "Inter Variable", Inter, sans-serif'
g.fillText("UI Sound", 72, 258); g.fillText("Generator", 72, 336)

g.fillStyle = ASH
g.font = '400 26px "Inter Variable", Inter, sans-serif'
;["Interface sounds, synthesized in the",
  "browser. Nothing to host, nothing to",
  "license."].forEach((l, i) => g.fillText(l, 72, 404 + i * 38))

const set = await R.normalizeSet(V.resolve({ presetId: "soft", deltas: {} }))
const picks = ["notification", "send", "success", "delete"]
const OFFSETS = [96, 0, 60, 24]          // the stagger, matching Ramps' card
const rowH = 122, gap = 22, top = 44

for (const [i, id] of picks.entries()) {
  const raw = await R.renderSound(set.sounds.find(s => s.id === id))
  let pk = 0; for (let n = 0; n < raw.length; n++) pk = Math.max(pk, Math.abs(raw[n]))
  // Trim the decay tail. Drawing the whole buffer crushes the audible part
  // into the first sixth of the row and leaves the rest a flat line.
  let last = raw.length - 1
  while (last > 0 && Math.abs(raw[last]) < pk * 0.02) last--
  const d = raw.subarray(0, Math.max(1, Math.floor(last * 1.06)))

  const x0 = 600 + OFFSETS[i], y0 = top + i * (rowH + gap), w = W - x0 + 40
  g.save()
  g.beginPath(); g.roundRect(x0, y0, w, rowH, 14); g.clip()
  g.fillStyle = "#eef3ff"; g.fillRect(x0, y0, w, rowH)
  g.fillStyle = ASH
  g.font = '400 17px "JetBrains Mono", monospace'
  g.fillText(id, x0 + 18, y0 + 30)
  // The curve sits in a band BELOW the label, not through it.
  const bandTop = y0 + 44, bandH = rowH - 44
  const mid = bandTop + bandH / 2, amp = bandH / 2 - 10
  g.strokeStyle = BLUE; g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round"
  g.beginPath()
  const inner = w - 36
  for (let px = 0; px <= inner; px++) {
    const n = Math.min(d.length - 1, Math.floor((px / inner) * d.length))
    const y = mid - (d[n] / (pk || 1)) * amp
    px === 0 ? g.moveTo(x0 + 18 + px, y) : g.lineTo(x0 + 18 + px, y)
  }
  g.stroke()
  g.restore()
}

const a = document.createElement('a')
a.href = c.toDataURL('image/png')
a.download = 'og.png'
a.click()
```

Then move the download to `public/og.png`.

## After changing it

`index.html` hardcodes `og:image:width`, `og:image:height` and an `og:image:alt`
naming the four sounds. If the dimensions or the picks change, change those too.
