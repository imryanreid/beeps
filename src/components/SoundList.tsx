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
import SoundPlot from "./SoundPlot"

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
  // One setting for the whole list, not per row — flipping it back on for every
  // sound you open would be its own small annoyance.
  const [showLabels, setShowLabels] = useState(false)

  return (
    <section className="mb-12">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">The set</h2>
        <p className="text-ash font-mono text-[11px]">
          base {Math.round(set.baseHz)} Hz · 11 sounds
        </p>
      </div>
      <p className="text-ash mb-5 max-w-[62ch] text-sm leading-relaxed">
        Press <Play size={11} weight="fill" className="text-ink inline" /> to hear a sound, or
        click its name to open it and change how it sounds. Every sound is derived from one base
        frequency, so editing one keeps the rest in tune with it.
      </p>

      <ul className="border-line divide-line divide-y border-t border-b">
        {set.sounds.map((sound) => (
          <SoundRow
            key={sound.id}
            sound={sound}
            baseHz={set.baseHz}
            edited={Boolean(config.deltas[sound.id])}
            open={openId === sound.id}
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels((v) => !v)}
            onToggle={() => setOpenId(openId === sound.id ? null : sound.id)}
            onPlay={() => onPlay(sound.id)}
            onEdit={(patch) => onEdit(sound.id, patch)}
          />
        ))}
      </ul>

      {/* Below the sounds: this is a summary OF the list, so it reads after it. */}
      <div className="mt-8">
        <SpectrumRail set={set} />
      </div>
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
  showLabels,
  onToggleLabels,
  onToggle,
  onPlay,
  onEdit,
}: {
  sound: Sound
  baseHz: number
  edited: boolean
  open: boolean
  showLabels: boolean
  onToggleLabels: () => void
  onToggle: () => void
  onPlay: () => void
  onEdit: (patch: SoundDelta) => void
}) {
  const spec = specFor(sound.id)
  const total = soundingMs(sound)
  const tooLong = total > DURATION_WARN_MS
  const span = frequencySpan(sound)

  return (
    <li className="group/row">
      <div className="hover:bg-ink/[0.02] flex items-center gap-3 py-2 transition-colors">
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
          {/* Named, not just a caret. A caret alone at this size reads as
              decoration, and the whole point is that these rows are editable. */}
          <span
            className={cn(
              "text-ash group-hover/row:text-ink hidden shrink-0 items-center gap-1 font-mono text-[11px] transition-colors sm:inline-flex",
              open && "text-ink",
            )}
          >
            {open ? "close" : "edit"}
            <CaretRight
              size={11}
              weight="bold"
              className={cn("transition-transform", open && "rotate-90")}
            />
          </span>
          <CaretRight
            size={12}
            weight="bold"
            className={cn(
              "text-ash shrink-0 transition-transform sm:hidden",
              open && "rotate-90",
            )}
          />
        </button>
      </div>

      {open && (
        <Editor
          sound={sound}
          spec={spec}
          baseHz={baseHz}
          showLabels={showLabels}
          onToggleLabels={onToggleLabels}
          onEdit={onEdit}
        />
      )}
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
  showLabels,
  onToggleLabels,
  onEdit,
}: {
  sound: Sound
  spec: ReturnType<typeof specFor>
  baseHz: number
  showLabels: boolean
  onToggleLabels: () => void
  onEdit: (patch: SoundDelta) => void
}) {
  const osc = sound.voices.find((v) => v.kind === "osc")
  if (!osc || osc.kind !== "osc") return null
  const partner = partnerOf(sound.id)
  const mirrored = partner?.kind === "inversion"
  const total = soundingMs(sound)
  const over = total > DURATION_WARN_MS

  return (
    <div className="bg-ink/[0.02] border-line -mx-4 border-t px-4 py-5 sm:mx-0 sm:px-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="text-ash max-w-[70ch] text-sm leading-relaxed">
          <span className="text-ink font-medium">Plays when:</span> {spec.when}{" "}
          <span className="text-ink font-medium">Not when:</span> {spec.whenNot}
        </p>
        {/*
          Off by default. With every control explaining itself the panel was a
          wall of prose you had to read past to reach the sliders — useful once,
          noise every time after.
        */}
        <button
          type="button"
          onClick={onToggleLabels}
          aria-pressed={showLabels}
          className="border-line hover:border-ink/30 text-ash hover:text-ink shrink-0 rounded border px-2 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors"
        >
          labels {showLabels ? "on" : "off"}
        </button>
      </div>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Group
            title="Pitch"
            help="Where the sound starts, where it lands, and how fast it gets there. A falling sweep reads as done or dismissed; a rising one as starting or sent."
            showLabels={showLabels}
          >
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field
                label="Starts at"
                unit="Hz"
                value={osc.pitch.startHz}
                min={200}
                max={2000}
                step={5}
                showLabels={showLabels}
                onChange={(v) => onEdit({ startHz: v })}
                hint="Higher reads as lighter and more urgent."
              />
              <Field
                label="Ends at"
                unit="Hz"
                value={osc.pitch.endHz}
                min={200}
                max={2000}
                step={5}
                showLabels={showLabels}
                onChange={(v) => onEdit({ endHz: v })}
                hint="Where it settles. This is the note you actually remember."
              />
              <Field
                label="Glide"
                unit="ms"
                value={osc.pitch.sweepMs}
                min={1}
                max={300}
                step={1}
                showLabels={showLabels}
                onChange={(v) => onEdit({ sweepMs: v })}
                hint="How long the pitch takes to travel. Short is a chirp; long is a swoop."
              />
            </div>
            {mirrored && (
              <p className="text-ash mt-3 text-[11px] leading-relaxed">
                Paired with <span className="text-ink font-medium">{partner.id}</span> — editing
                either pitch mirrors the other.
              </p>
            )}
          </Group>

          <Group
            title="Shape"
            help="How the volume rises and falls. This is what separates a click from a beep — far more than pitch does."
            showLabels={showLabels}
          >
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field
                label="Attack"
                unit="ms"
                value={osc.env.attackMs}
                min={LIMITS.attackMs[0]}
                max={60}
                step={0.5}
                dp={1}
                showLabels={showLabels}
                onChange={(v) => onEdit({ attackMs: v })}
                hint="How fast it starts. Under 10ms is a click; over 20ms is a beep."
              />
              <Field
                label="Decay"
                unit="ms"
                value={osc.env.decayMs}
                min={1}
                max={400}
                step={1}
                showLabels={showLabels}
                onChange={(v) => onEdit({ decayMs: v })}
                hint="How fast it drops away after the peak. Most of the length lives here."
              />
              <Field
                label="Release"
                unit="ms"
                value={osc.env.releaseMs}
                min={1}
                max={300}
                step={1}
                showLabels={showLabels}
                onChange={(v) => onEdit({ releaseMs: v })}
                hint="The tail. Long tails pile up when a sound repeats — test with rapid-fire."
              />
            </div>
          </Group>

          <Group
            title="Tone"
            help="A filter over the whole sound. Use it to take the edge off, or to thin something out."
            showLabels={showLabels}
            last
          >
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
              <Field
                label="Brightness"
                unit="Hz"
                value={sound.filter.cutoffHz}
                min={200}
                max={12000}
                step={50}
                showLabels={showLabels}
                onChange={(v) => onEdit({ cutoffHz: v })}
                hint="Lower is duller and warmer. Higher is thinner and more present."
              />
              <Field
                label="Resonance"
                unit=""
                value={sound.filter.q}
                min={0.1}
                max={20}
                step={0.1}
                dp={1}
                showLabels={showLabels}
                onChange={(v) => onEdit({ q: v })}
                hint={
                  sound.filter.q > 12
                    ? "Above 12 it rings on after the sound should have stopped."
                    : "Emphasis right at the brightness point. A little adds focus."
                }
              />
            </div>
          </Group>
        </div>

        {/* The plot, on its own side. It reads everything the sliders set. */}
        <div className="min-w-0">
          <div className="border-line bg-paper rounded-md border p-2">
            <SoundPlot sound={sound} baseHz={baseHz} />
          </div>
          <dl className="text-ash mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
            <div className="flex justify-between gap-2">
              <dt>sweep</dt>
              <dd className="text-ink">{intervalLabel(osc.pitch.startHz, osc.pitch.endHz)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>lands</dt>
              <dd className="text-ink">{semitoneLabel(osc.pitch.endHz, baseHz)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>length</dt>
              <dd className={cn(over ? "text-amber-500" : "text-ink")}>
                {Math.round(total)}ms
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>tier</dt>
              <dd className="text-ink">{sound.tier}</dd>
            </div>
          </dl>
          {over && showLabels && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-500">
              Past {DURATION_WARN_MS}ms a UI sound starts overlapping whatever the user does
              next, which reads as the app being slow.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** A titled block. Its explainer is what the labels toggle hides. */
function Group({
  title,
  help,
  showLabels,
  last,
  children,
}: {
  title: string
  help: string
  showLabels: boolean
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn(!last && "mb-6")}>
      <div className={cn(showLabels ? "mb-3" : "mb-2")}>
        <Label className={showLabels ? "mb-1" : "mb-0"}>{title}</Label>
        {showLabels && (
          <p className="text-ash max-w-[70ch] text-[11px] leading-relaxed">{help}</p>
        )}
      </div>
      {children}
    </div>
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
  showLabels,
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
  showLabels: boolean
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
      {hint && showLabels && (
        <p className="text-ash mt-1 text-[11px] leading-relaxed">{hint}</p>
      )}
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
