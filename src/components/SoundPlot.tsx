// ==============================================
// SOUND PLOT
// One picture of what a sound actually does: pitch
// over time on top, loudness over time underneath,
// on a shared clock.
//
// The axes are FIXED — 200 Hz to 2 kHz, and 0 to
// 250 ms — not scaled to whatever this sound happens
// to span. That is the whole point. Auto-scaling made
// a 1.6-semitone dip and a full octave drop draw
// exactly the same line, so the picture carried no
// information you did not already have from the
// numbers. Against a fixed frame a small fall looks
// small, `delete` visibly plummets, and two sounds
// can be compared by flicking between them.
//
// Both reference marks earn their place: the base
// frequency, because every sound in the set is an
// interval from it, and the 200 ms line, because that
// is the budget — a sound running past it is
// something you should be able to see, not only read.
// ==============================================
import { cn } from "../shared/utils"
import { DURATION_BUDGET } from "../lib/resolve"
import { envelopeSegments } from "../runtime/beeps.js"
import type { Sound } from "../lib/sounds"

// The fixed frame. Wide enough for anything the sliders can reach.
const HZ_MIN = 200
const HZ_MAX = 2000

const W = 320
const H = 168
const PAD = { left: 30, right: 8, top: 10, bottom: 16 }
/** Pitch gets the top two-thirds; loudness reads fine in the rest. */
const SPLIT = 0.66
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const PITCH_H = PLOT_H * SPLIT
const AMP_TOP = PAD.top + PITCH_H + 8
const AMP_H = PLOT_H - PITCH_H - 8

export default function SoundPlot({ sound, baseHz }: { sound: Sound; baseHz: number }) {
  const osc = sound.voices.find((v) => v.kind === "osc")
  if (!osc || osc.kind !== "osc") return null

  const seg = envelopeSegments(osc.env, sound.durationMs)
  const total = seg.totalMs
  const budget = DURATION_BUDGET[sound.tier]
  // The time axis is the TIER's window, so every sound in a tier is drawn on
  // the same clock and can be compared by flicking between them. It stretches
  // only for a sound that has run past its own ceiling — which is exactly the
  // case you want to see rather than have quietly rescaled out of view.
  const msMax = Math.max(budget.maxMs * 1.05, total * 1.05)

  const x = (ms: number) => PAD.left + (ms / msMax) * PLOT_W
  const y = (hz: number) => {
    const clamped = Math.min(HZ_MAX, Math.max(HZ_MIN, hz))
    const t = (Math.log2(clamped) - Math.log2(HZ_MIN)) / Math.log2(HZ_MAX / HZ_MIN)
    return PAD.top + (1 - t) * PITCH_H
  }

  // An exponential glide is a straight line on a log axis, which is exactly
  // what this plot has — so the pitch path is two segments, no sampling.
  const glideEnd = Math.min(osc.pitch.sweepMs, total)
  const pitchPath = [
    `M ${x(0)} ${y(osc.pitch.startHz)}`,
    `L ${x(glideEnd)} ${y(osc.pitch.endHz)}`,
    `L ${x(total)} ${y(osc.pitch.endHz)}`,
  ].join(" ")

  // The envelope, as the runtime plays it.
  const ampY = (level: number) => AMP_TOP + (1 - level) * AMP_H
  const sustain = osc.env.sustain
  const tAttack = seg.attack
  const tDecay = tAttack + seg.decay
  const tRelease = tDecay + seg.sustainTime
  const ampPath = [
    `M ${x(0)} ${ampY(0)}`,
    `L ${x(tAttack)} ${ampY(1)}`,
    `L ${x(tDecay)} ${ampY(sustain)}`,
    ...(seg.sustainTime > 0 ? [`L ${x(tRelease)} ${ampY(sustain)}`] : []),
    `L ${x(total)} ${ampY(0)}`,
    "Z",
  ].join(" ")

  const tooLong = total > budget.maxMs
  const tooShort = total < budget.minMs
  const baseInFrame = baseHz >= HZ_MIN && baseHz <= HZ_MAX

  const hzTicks = [250, 500, 1000, 2000].filter((hz) => hz >= HZ_MIN && hz <= HZ_MAX)
  const msTicks = [100, 250, 500].filter((ms) => ms < msMax * 0.95)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="text-ink h-auto w-full"
      role="img"
      aria-label={`${sound.id}: pitch from ${Math.round(osc.pitch.startHz)} to ${Math.round(
        osc.pitch.endHz,
      )} hertz over ${Math.round(osc.pitch.sweepMs)} milliseconds, ${Math.round(
        total,
      )} milliseconds long`}
    >
      {/* Frequency gridlines */}
      {hzTicks.map((hz) => (
        <g key={hz}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(hz)}
            y2={y(hz)}
            className="stroke-line"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={PAD.left - 5}
            y={y(hz) + 3}
            textAnchor="end"
            className="fill-ash font-mono"
            fontSize="7"
          >
            {hz >= 1000 ? `${hz / 1000}k` : hz}
          </text>
        </g>
      ))}

      {/* The base frequency. Every sound in the set is an interval from it. */}
      {baseInFrame && (
        <>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(baseHz)}
            y2={y(baseHz)}
            className="stroke-ink/35"
            strokeWidth="1"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={W - PAD.right}
            y={y(baseHz) - 3}
            textAnchor="end"
            className="fill-ash font-mono"
            fontSize="7"
          >
            base
          </text>
        </>
      )}

      {/*
        Both edges of the tier's window. The lower one is the half no other tool
        draws, and it is the one people need: a sound left of it is not subtle,
        it is too short for the ear to register.
      */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={Math.max(0, x(budget.minMs) - PAD.left)}
        height={AMP_TOP + AMP_H - PAD.top}
        className={cn(tooShort ? "fill-amber-500/15" : "fill-ink/[0.04]")}
      />
      {x(budget.maxMs) < W - PAD.right && (
        <>
          <line
            x1={x(budget.maxMs)}
            x2={x(budget.maxMs)}
            y1={PAD.top}
            y2={AMP_TOP + AMP_H}
            className={cn(tooLong ? "stroke-amber-500" : "stroke-line")}
            strokeWidth="1"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={x(budget.maxMs) - 3}
            y={PAD.top + 7}
            textAnchor="end"
            className={cn("font-mono", tooLong ? "fill-amber-500" : "fill-ash")}
            fontSize="7"
          >
            {budget.maxMs}ms
          </text>
        </>
      )}

      {/* Pitch */}
      <path
        d={pitchPath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(0)} cy={y(osc.pitch.startHz)} r="2.5" fill="currentColor" />
      <circle cx={x(glideEnd)} cy={y(osc.pitch.endHz)} r="2.5" fill="currentColor" />

      {/* Loudness */}
      <path d={ampPath} className="fill-ink/15" />
      <path
        d={ampPath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.5"
        vectorEffect="non-scaling-stroke"
      />

      {/* Time axis */}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={AMP_TOP + AMP_H}
        y2={AMP_TOP + AMP_H}
        className="stroke-line"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {msTicks.map((ms) => (
        <text
          key={ms}
          x={x(ms)}
          y={H - 4}
          textAnchor="middle"
          className="fill-ash font-mono"
          fontSize="7"
        >
          {ms}ms
        </text>
      ))}
      <text
        x={PAD.left}
        y={H - 4}
        textAnchor="middle"
        className="fill-ash font-mono"
        fontSize="7"
      >
        0
      </text>
    </svg>
  )
}
