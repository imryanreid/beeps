// ==============================================
// SOUND LIST
// The eleven sounds, each playable, each openable
// into an editor.
//
// The pitch envelope block comes first and is the
// largest control, because the downward sweep is the
// most important parameter in the tool — it is what
// separates a confirmation from a dismissal. ADSR,
// filter and duration sit under it.
//
// Editing propagates: a pitch change on half of an
// inversion pair rewrites the other half, and the
// row says so rather than leaving it to be noticed.
// ==============================================
import { useState } from "react"
import { CaretRight, Play, Warning } from "@phosphor-icons/react"
import { Label } from "../shared/components/Label"
import { cn } from "../shared/utils"
import { HOVER_LIFT } from "../shared/motion"
import {
  DURATION_WARN_MS,
  LIMITS,
  frequencySpan,
  soundingMs,
  type SetConfig,
  type SoundDelta,
} from "../lib/resolve"
import { partnerOf, specFor, type Sound, type SoundId, type SoundSet } from "../lib/sounds"

export default function SoundList({
  set,
  config,
  onEdit,
  onPlay,
}: {
  set: SoundSet
  config: SetConfig
  onEdit: (id: SoundId, patch: SoundDelta) => void
  onPlay: (id: SoundId) => void
}) {
  const [openId, setOpenId] = useState<SoundId | null>(null)

  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">The set</h2>
        <p className="text-ash font-mono text-[11px]">
          base {Math.round(set.baseHz)} Hz · 11 sounds
        </p>
      </div>

      <SpectrumRail set={set} />

      <ul className="border-line divide-line mt-6 divide-y border-t border-b">
        {set.sounds.map((sound) => (
          <SoundRow
            key={sound.id}
            sound={sound}
            baseHz={set.baseHz}
            edited={Boolean(config.deltas[sound.id])}
            open={openId === sound.id}
            onToggle={() => setOpenId(openId === sound.id ? null : sound.id)}
            onPlay={() => onPlay(sound.id)}
            onEdit={(patch) => onEdit(sound.id, patch)}
          />
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// The spectrum rail
// ---------------------------------------------------------------------------

const RAIL_MIN = 100
const RAIL_MAX = 8000

/** Log position, 0–1. Pitch is logarithmic, so a linear axis would be useless. */
const railX = (hz: number) =>
  (Math.log2(Math.max(RAIL_MIN, Math.min(RAIL_MAX, hz)) / RAIL_MIN) /
    Math.log2(RAIL_MAX / RAIL_MIN)) *
  100

/**
 * Every sound's frequency span, drawn against the three zones that matter.
 *
 * This is the frequency guidance as a picture rather than a paragraph. Drag the
 * base down and you *watch* `delete` fall into the phone-speaker floor, which
 * is the kind of thing a written guideline never conveys in time to prevent it.
 *
 * The floor is a gradient rather than a line on purpose: micro-speakers give up
 * somewhere between 250 and 800 Hz depending on the enclosure, so the honest
 * statement is "increasingly unreliable", not "inaudible below X".
 */
function SpectrumRail({ set }: { set: SoundSet }) {
  const ticks = [125, 250, 500, 1000, 2000, 4000, 8000]
  return (
    <div>
      <Label className="mb-2">Where the set sits</Label>
      <div className="border-line relative h-24 overflow-hidden rounded-lg border">
        {/* Phone-speaker floor — a gradient, because the knee depends on the
            enclosure rather than on a standard. */}
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${railX(500)}%`,
            background:
              "linear-gradient(to right, rgba(220,38,38,0.16), rgba(220,38,38,0.16) 40%, transparent)",
          }}
        />
        {/* Harsh band, 2-5kHz. */}
        <div
          className="absolute inset-y-0 bg-amber-500/10"
          style={{ left: `${railX(2000)}%`, width: `${railX(5000) - railX(2000)}%` }}
        />
        {/* Dead air above ~12kHz is off the right edge of this rail. */}

        {set.sounds.map((sound, i) => {
          const span = frequencySpan(sound)
          const left = railX(span.minHz)
          const width = Math.max(0.8, railX(span.maxHz) - left)
          return (
            <div
              key={sound.id}
              title={`${sound.id} — ${Math.round(span.minHz)}–${Math.round(span.maxHz)} Hz`}
              className="bg-ink/60 absolute h-1 rounded-full"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                top: `${8 + i * 6}px`,
              }}
            />
          )
        })}

        {ticks.map((hz) => (
          <div
            key={hz}
            className="absolute inset-y-0 flex items-end"
            style={{ left: `${railX(hz)}%` }}
          >
            <div className="bg-line absolute inset-y-0 w-px" />
            <span className="text-ash relative pb-1 pl-1 font-mono text-[9px]">
              {hz >= 1000 ? `${hz / 1000}k` : hz}
            </span>
          </div>
        ))}
      </div>
      <p className="text-ash mt-2 font-mono text-[10px]">
        red: below the phone-speaker floor · amber: the 2–5kHz harsh band
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A row
// ---------------------------------------------------------------------------

function SoundRow({
  sound,
  baseHz,
  edited,
  open,
  onToggle,
  onPlay,
  onEdit,
}: {
  sound: Sound
  baseHz: number
  edited: boolean
  open: boolean
  onToggle: () => void
  onPlay: () => void
  onEdit: (patch: SoundDelta) => void
}) {
  const spec = specFor(sound.id)
  const total = soundingMs(sound)
  const tooLong = total > DURATION_WARN_MS
  const span = frequencySpan(sound)

  return (
    <li>
      <div className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play ${sound.id}`}
          className={cn(
            "border-line hover:border-ink/30 hover:bg-ink/[0.04] flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors",
            HOVER_LIFT,
          )}
        >
          <Play size={12} weight="fill" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="font-mono text-[13px]">{sound.id}</span>
          {edited && (
            <span className="bg-ink/[0.06] text-ash rounded-full px-1.5 text-[8px] tracking-wide uppercase">
              edited
            </span>
          )}
          <span className="text-ash hidden font-mono text-[11px] sm:inline">{sound.tier}</span>
          <span className="text-ash ml-auto hidden font-mono text-[11px] md:inline">
            {Math.round(span.minHz)}–{Math.round(span.maxHz)} Hz
          </span>
          <span
            className={cn("font-mono text-[11px]", tooLong ? "text-amber-500" : "text-ash")}
            title={
              tooLong
                ? `${Math.round(total)}ms of sounding time. Past ${DURATION_WARN_MS}ms a UI sound starts overlapping the next interaction.`
                : undefined
            }
          >
            {tooLong && <Warning size={11} weight="fill" className="mr-1 inline" />}
            {Math.round(total)}ms
          </span>
          <CaretRight
            size={12}
            weight="bold"
            className={cn("text-ash shrink-0 transition-transform", open && "rotate-90")}
          />
        </button>
      </div>

      {open && <Editor sound={sound} spec={spec} baseHz={baseHz} onEdit={onEdit} />}
    </li>
  )
}

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

function Editor({
  sound,
  spec,
  baseHz,
  onEdit,
}: {
  sound: Sound
  spec: ReturnType<typeof specFor>
  baseHz: number
  onEdit: (patch: SoundDelta) => void
}) {
  const osc = sound.voices.find((v) => v.kind === "osc")
  if (!osc || osc.kind !== "osc") return null
  const partner = partnerOf(sound.id)
  const mirrored = partner?.kind === "inversion"

  return (
    <div className="bg-ink/[0.02] border-line -mx-4 border-t px-4 py-5 sm:mx-0 sm:px-5">
      <p className="text-ash mb-5 max-w-[70ch] text-sm leading-relaxed">
        <span className="text-ink">Plays when:</span> {spec.when}{" "}
        <span className="text-ink">Not when:</span> {spec.whenNot}
      </p>

      {/*
        The pitch envelope, first and largest. The downward sweep is the most
        important control in the tool — direction is what makes a sound read as
        a confirmation or a dismissal — so it does not sit in an accordion
        under the envelope timings.
      */}
      <div className="border-line mb-5 rounded-lg border p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <Label className="mb-0">Pitch envelope</Label>
          <span className="text-ash font-mono text-[11px]">
            {intervalLabel(osc.pitch.startHz, osc.pitch.endHz)}
          </span>
        </div>

        <Sweep startHz={osc.pitch.startHz} endHz={osc.pitch.endHz} />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Start"
            unit="Hz"
            value={osc.pitch.startHz}
            min={LIMITS.freqHz[0]}
            max={2000}
            step={5}
            onChange={(v) => onEdit({ startHz: v })}
          />
          <Field
            label="End"
            unit="Hz"
            value={osc.pitch.endHz}
            min={LIMITS.freqHz[0]}
            max={2000}
            step={5}
            onChange={(v) => onEdit({ endHz: v })}
          />
        </div>

        {mirrored && (
          <p className="text-ash mt-3 font-mono text-[10px] leading-relaxed">
            Paired with <span className="text-ink">{partner.id}</span> — changing either pitch
            mirrors the other, so the two stay inversions.
          </p>
        )}
        <p className="text-ash mt-1 font-mono text-[10px]">
          base {Math.round(baseHz)} Hz · lands {semitoneLabel(osc.pitch.endHz, baseHz)}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Attack"
          unit="ms"
          value={osc.env.attackMs}
          min={LIMITS.attackMs[0]}
          max={60}
          step={0.5}
          onChange={(v) => onEdit({ attackMs: v })}
          hint="Single digits is a click. Above ~20ms is a beep."
        />
        <Field
          label="Decay"
          unit="ms"
          value={osc.env.decayMs}
          min={1}
          max={400}
          step={1}
          onChange={(v) => onEdit({ decayMs: v })}
        />
        <Field
          label="Release"
          unit="ms"
          value={osc.env.releaseMs}
          min={1}
          max={300}
          step={1}
          onChange={(v) => onEdit({ releaseMs: v })}
        />
        <Field
          label="Duration"
          unit="ms"
          value={sound.durationMs}
          min={20}
          max={400}
          step={5}
          onChange={(v) => onEdit({ durationMs: v })}
        />
        <Field
          label="Cutoff"
          unit="Hz"
          value={sound.filter.cutoffHz}
          min={200}
          max={12000}
          step={50}
          onChange={(v) => onEdit({ cutoffHz: v })}
        />
        <Field
          label="Resonance"
          unit="Q"
          value={sound.filter.q}
          min={0.1}
          max={20}
          step={0.1}
          dp={1}
          onChange={(v) => onEdit({ q: v })}
          hint={sound.filter.q > 12 ? "Above 12 it rings after the envelope shuts." : undefined}
        />
      </div>
    </div>
  )
}

/** A small picture of the sweep, so direction is visible before it is audible. */
function Sweep({ startHz, endHz }: { startHz: number; endHz: number }) {
  const hi = Math.max(startHz, endHz)
  const lo = Math.min(startHz, endHz)
  const y = (hz: number) => {
    if (hi === lo) return 20
    return 34 - ((Math.log2(hz) - Math.log2(lo)) / (Math.log2(hi) - Math.log2(lo))) * 28
  }
  return (
    <svg viewBox="0 0 200 40" className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
      <path
        d={`M 2 ${y(startHz)} C 70 ${y(startHz)}, 100 ${y(endHz)}, 198 ${y(endHz)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="text-ink"
      />
    </svg>
  )
}

function Field({
  label,
  unit,
  value,
  min,
  max,
  step,
  dp = 0,
  hint,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  dp?: number
  hint?: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Label className="mb-0">{label}</Label>
        <span className="text-ash font-mono text-[11px]">
          {value.toFixed(dp)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} in ${unit}`}
        className="accent-ink h-1 w-full cursor-pointer"
      />
      {hint && <p className="text-ash mt-1 font-mono text-[10px] leading-relaxed">{hint}</p>}
    </div>
  )
}

const intervalLabel = (startHz: number, endHz: number): string => {
  const semis = Math.log2(endHz / startHz) * 12
  if (Math.abs(semis) < 0.25) return "steady"
  const rounded = Math.abs(semis).toFixed(1).replace(/\.0$/, "")
  return semis > 0 ? `rises ${rounded} semitones` : `falls ${rounded} semitones`
}

const semitoneLabel = (hz: number, baseHz: number): string => {
  const semis = Math.round(Math.log2(hz / baseHz) * 12)
  if (semis === 0) return "on the base"
  return `${semis > 0 ? "+" : ""}${semis} semitones`
}
