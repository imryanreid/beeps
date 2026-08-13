// ==============================================
// PREVIEW
// Real UI that makes the sounds, plus the two tests
// that actually tell you whether a set is any good.
//
// Never an abstract play button. A play button next
// to a waveform tells you what a sound IS; it does
// not tell you what it is like to use, which is the
// only question that matters. So a button behaves
// like a button, a toggle like a toggle, and a form
// submits and then succeeds or fails.
//
// RAPID-FIRE is the important one. Ten triggers in
// fast succession is the fastest way to find out
// whether you can live with a sound, and almost no
// tool offers it — so it sits with the surfaces as a
// primary control, not behind a menu.
// ==============================================
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowClockwise,
  Bell,
  CheckCircle,
  PaperPlaneTilt,
  SpeakerSimpleHigh,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react"
import { Label } from "../shared/components/Label"
import Segmented from "../shared/components/Segmented"
import { cn } from "../shared/utils"
import { HOVER_LIFT } from "../shared/motion"
import Audition from "./Audition"
import type { Sound, SoundId } from "../lib/sounds"

type PlayFn = (id: SoundId) => void

export default function Preview({
  play,
  playOne,
  playSequence,
  started,
  muted,
}: {
  play: PlayFn
  playOne: (sound: Sound) => void
  playSequence: (ids: SoundId[], gapMs: number) => void
  started: boolean
  muted: boolean
}) {
  // Shared between rapid-fire and audition — you almost always want to hear
  // the same sound hammered and then compared across characters.
  const [focusId, setFocusId] = useState<SoundId>("tap")
  return (
    <section className="mb-12">
      {/*
        A section heading, matching "Sounds" above — not the shared PanelTitle,
        which is deliberately smaller from `sm:` up because it titles a panel
        inside a section rather than a section itself. These two are peers on
        the page, so they need to look like peers.
      */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Preview</h2>
        {!started && <GestureHint />}
      </div>

      {/*
        `block` on both group labels is doing real work. Label renders a <span>
        by default, and vertical margins do not apply to an inline box — so the
        `mt-8 mb-3` that used to sit on the second one was declared and then
        silently ignored, leaving 7px above and 3px below instead of 32 and 12.
        That is why this label read as crowded against the grids on either side.
      */}
      <Label className="mb-3 block">Tools</Label>
      <div className={cn("grid gap-3 lg:grid-cols-3", muted && "opacity-50")}>
        <RapidFire play={play} soundId={focusId} onSoundId={setFocusId} />
        <Audition soundId={focusId} onSoundId={setFocusId} playOne={playOne} />
        <Sequence playSequence={playSequence} />
      </div>

      <Label className="mt-10 mb-3 block">UI Examples</Label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ButtonSurface play={play} />
        <ToggleSurface play={play} />
        <FormSurface play={play} />
        <NotificationSurface play={play} />
        <ListSurface play={play} />
        <MenuSurface play={play} />
      </div>
    </section>
  )
}

/**
 * Shown until the first gesture starts the context.
 *
 * Reads as a state, not an error — nothing has gone wrong, the browser simply
 * will not start audio until someone clicks something. Saying so is what stops
 * a silent first click looking like a broken tool.
 */
function GestureHint() {
  return (
    <p className="text-ash inline-flex items-center gap-1.5 font-mono text-[11px]">
      <SpeakerSimpleHigh size={13} weight="bold" />
      click anything below to start audio
    </p>
  )
}

// ---------------------------------------------------------------------------
// The two tests
// ---------------------------------------------------------------------------

const RAPID_COUNT = 10

/**
 * The annoyance detector.
 *
 * Fires one sound ten times at a fixed interval. Voices overlap rather than
 * cutting each other off — retriggering by stopping the previous instance is a
 * different sound, and it hides the exact problem this exists to find, which is
 * a release tail stacking into mush.
 */
function RapidFire({
  play,
  soundId: id,
  onSoundId: setId,
}: {
  play: PlayFn
  soundId: SoundId
  onSoundId: (v: SoundId) => void
}) {
  const [intervalMs, setIntervalMs] = useState(120)
  const [firing, setFiring] = useState(false)
  const timers = useRef<number[]>([])

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }, [])

  useEffect(() => clear, [clear])

  const fire = useCallback(() => {
    clear()
    setFiring(true)
    for (let i = 0; i < RAPID_COUNT; i++) {
      timers.current.push(window.setTimeout(() => play(id), i * intervalMs))
    }
    timers.current.push(
      window.setTimeout(() => setFiring(false), RAPID_COUNT * intervalMs + 200),
    )
  }, [clear, play, id, intervalMs])

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Label className="mb-0">Rapid-fire</Label>
        <span className="text-ash font-mono text-[11px]">{RAPID_COUNT}x</span>
      </div>
      <p className="text-ash mb-4 text-sm leading-relaxed">
        The fastest way to find out whether a sound is tolerable. If it grates here, it will
        grate in an app.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SoundSelect value={id} onChange={setId} />
        <Segmented
          value={String(intervalMs)}
          onChange={(v) => setIntervalMs(Number(v))}
          size="sm"
          layoutId="rapid-interval-pill"
          ariaLabel="Interval between triggers"
          options={[
            { id: "60", label: "60ms" },
            { id: "120", label: "120ms" },
            { id: "250", label: "250ms" },
          ]}
        />
      </div>

      <button
        type="button"
        onClick={fire}
        className={cn(
          "bg-ink text-paper inline-flex h-9 items-center gap-2 rounded-md px-4 font-mono text-[11px] shadow-sm",
          HOVER_LIFT,
        )}
      >
        <ArrowClockwise size={13} weight="bold" className={cn(firing && "animate-spin")} />
        {firing ? "firing" : `fire ${RAPID_COUNT}x`}
      </button>
    </Card>
  )
}

/** tap → send → success, with realistic gaps, so the set is heard as a flow. */
function Sequence({ playSequence }: { playSequence: (ids: SoundId[], gapMs: number) => void }) {
  const flows: { label: string; ids: SoundId[] }[] = [
    { label: "submit", ids: ["tap", "send", "success"] },
    { label: "fail", ids: ["tap", "send", "error"] },
    { label: "browse", ids: ["open", "tap", "close"] },
  ]
  return (
    <Card>
      <Label className="mb-3">Sequence</Label>
      <p className="text-ash mb-4 text-sm leading-relaxed">
        A real interaction is several sounds in a row. Clashes between them only show up here.
      </p>
      <div className="flex flex-wrap gap-2">
        {flows.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => playSequence(f.ids, 260)}
            className={cn(
              "border-line hover:border-ink/30 hover:bg-ink/[0.03] rounded-md border px-3 py-2 text-left font-mono text-[11px] transition-colors",
              HOVER_LIFT,
            )}
          >
            <span className="text-ink block">{f.label}</span>
            <span className="text-ash">{f.ids.join(" → ")}</span>
          </button>
        ))}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// The surfaces
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border-line rounded-lg border p-4">{children}</div>
}

function SurfaceCard({
  title,
  fires,
  children,
}: {
  title: string
  fires: string
  children: React.ReactNode
}) {
  return (
    <div className="border-line flex flex-col rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="font-display text-base font-semibold tracking-tight">{title}</span>
        <span className="text-ash font-mono text-[10px]">{fires}</span>
      </div>
      <div className="flex flex-1 items-center">{children}</div>
    </div>
  )
}

const CONTROL =
  "border-line hover:border-ink/30 hover:bg-ink/[0.03] rounded-md border px-3 h-9 font-mono text-[11px] transition-colors"

function ButtonSurface({ play }: { play: PlayFn }) {
  return (
    <SurfaceCard title="Button" fires="tap">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => play("tap")}
          className={cn(
            "bg-ink text-paper h-9 rounded-md px-4 font-mono text-[11px]",
            HOVER_LIFT,
          )}
        >
          Save
        </button>
        <button type="button" onClick={() => play("tap")} className={CONTROL}>
          Cancel
        </button>
      </div>
    </SurfaceCard>
  )
}

function ToggleSurface({ play }: { play: PlayFn }) {
  const [on, setOn] = useState(false)
  return (
    <SurfaceCard title="Toggle" fires="toggle.on / off">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Notifications"
        onClick={() => {
          const next = !on
          setOn(next)
          play(next ? "toggle.on" : "toggle.off")
        }}
        className="flex items-center gap-3"
      >
        <span
          className={cn(
            "relative h-6 w-10 shrink-0 rounded-full transition-colors",
            on ? "bg-ink" : "bg-ink/20",
          )}
        >
          {/*
            The knob is positioned with `left`, not a transform, and both parts
            of that are deliberate.

            It previously had NO horizontal anchor at all — `top-1` for the
            vertical axis and `translate-x-*` for the horizontal one. With
            `left: auto` an absolute box falls back to its static position, and
            that position is skewed by the inherited `text-align`, which is
            `center` here because Tailwind's Preflight resets nearly everything
            on a <button> except that. So the origin was never 0, the translate
            stacked on top of it, and the knob sat against the right cap in
            BOTH states — spilling out of the pill and onto the label.

            The translate was then also failing to apply in this subtree: the
            class was present and `--tw-translate-x` held the right value, yet
            the computed `translate` stayed `0px`, while the same element cloned
            into a neutral parent animated correctly. Rather than depend on that,
            the position is now stated outright. `left` is the property actually
            being reasoned about, a 16px knob gains nothing measurable from
            compositing, and there is no custom-property indirection left to
            break.

            Arithmetic, stated once: the track is w-10 (40) and the knob w-4
            (16), so a 4px inset on each side means left-1 (4) when off and
            left-5 (20) when on.
          */}
          <span
            className={cn(
              "bg-paper absolute top-1 h-4 w-4 rounded-full transition-[left] duration-200 ease-out",
              on ? "left-5" : "left-1",
            )}
          />
        </span>
        <span className="font-mono text-[11px]">{on ? "on" : "off"}</span>
      </button>
    </SurfaceCard>
  )
}

/** Submit, then succeed or fail — the flow `send` and `success` exist for. */
function FormSurface({ play }: { play: PlayFn }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle")
  const timer = useRef<number | null>(null)
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), [])

  const submit = (succeed: boolean) => {
    setState("sending")
    play("send")
    timer.current = window.setTimeout(() => {
      setState(succeed ? "done" : "failed")
      play(succeed ? "success" : "error")
    }, 650)
  }

  return (
    <SurfaceCard title="Form" fires="send → success / error">
      <div className="w-full">
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            disabled={state === "sending"}
            onClick={() => submit(true)}
            className={cn(
              "bg-ink text-paper h-9 rounded-md px-3 font-mono text-[11px] disabled:opacity-40",
              HOVER_LIFT,
            )}
          >
            Submit
          </button>
          <button
            type="button"
            disabled={state === "sending"}
            onClick={() => submit(false)}
            className={cn(CONTROL, "disabled:opacity-40")}
          >
            Submit → fail
          </button>
        </div>
        <p className="text-ash flex h-4 items-center gap-1.5 font-mono text-[10px]">
          {state === "sending" && "sending…"}
          {state === "done" && (
            <>
              <CheckCircle size={12} weight="fill" /> saved
            </>
          )}
          {state === "failed" && (
            <>
              <WarningCircle size={12} weight="fill" /> could not save
            </>
          )}
        </p>
      </div>
    </SurfaceCard>
  )
}

function NotificationSurface({ play }: { play: PlayFn }) {
  const [items, setItems] = useState<number[]>([])
  const next = useRef(1)
  return (
    <SurfaceCard title="Notification" fires="notification / receive">
      <div className="w-full">
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setItems((v) => [...v, next.current++].slice(-3))
              play("notification")
            }}
            className={cn(CONTROL, "inline-flex items-center gap-1.5")}
          >
            <Bell size={12} weight="bold" />
            Notify
          </button>
          <button
            type="button"
            onClick={() => {
              setItems((v) => [...v, next.current++].slice(-3))
              play("receive")
            }}
            className={CONTROL}
          >
            Receive
          </button>
        </div>
        <div className="text-ash font-mono text-[10px]">
          {items.length ? `${items.length} in tray` : "tray empty"}
        </div>
      </div>
    </SurfaceCard>
  )
}

function ListSurface({ play }: { play: PlayFn }) {
  const [rows, setRows] = useState(["Draft", "Archive", "Notes"])
  return (
    <SurfaceCard title="List" fires="delete">
      <div className="w-full">
        {rows.length === 0 ? (
          <button
            type="button"
            onClick={() => setRows(["Draft", "Archive", "Notes"])}
            className="text-ash hover:text-ink font-mono text-[11px] transition-colors"
          >
            ↺ restore rows
          </button>
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((row) => (
              <li key={row} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{row}</span>
                <button
                  type="button"
                  aria-label={`Delete ${row}`}
                  onClick={() => {
                    setRows((v) => v.filter((r) => r !== row))
                    play("delete")
                  }}
                  className="text-ash hover:text-ink transition-colors"
                >
                  <Trash size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SurfaceCard>
  )
}

function MenuSurface({ play }: { play: PlayFn }) {
  const [open, setOpen] = useState(false)
  return (
    <SurfaceCard title="Menu" fires="open / close">
      <div className="w-full">
        <button
          type="button"
          onClick={() => {
            const next = !open
            setOpen(next)
            play(next ? "open" : "close")
          }}
          className={cn(CONTROL, "inline-flex items-center gap-1.5")}
        >
          <PaperPlaneTilt size={12} weight="bold" />
          {open ? "Close menu" : "Open menu"}
        </button>
        {open && (
          <ul className="border-line mt-2 rounded-md border p-1">
            {["Duplicate", "Rename", "Move"].map((item) => (
              <li key={item}>
                <button
                  type="button"
                  onClick={() => play("tap")}
                  className="hover:bg-ink/[0.04] w-full rounded px-2 py-1 text-left font-mono text-[11px] transition-colors"
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SurfaceCard>
  )
}

// ---------------------------------------------------------------------------

function SoundSelect({ value, onChange }: { value: SoundId; onChange: (v: SoundId) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SoundId)}
      aria-label="Sound to fire"
      className="border-line bg-paper text-ink hover:border-ink/30 h-9 appearance-none rounded-md border px-3 pr-7 font-mono text-[11px] transition-colors"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' fill='none' stroke='%236b6a63' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
      }}
    >
      {SOUND_OPTIONS.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  )
}

const SOUND_OPTIONS: SoundId[] = [
  "tap",
  "toggle.on",
  "toggle.off",
  "open",
  "close",
  "send",
  "receive",
  "success",
  "error",
  "notification",
  "delete",
]
