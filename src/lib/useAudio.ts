// ==============================================
// USE AUDIO
// The one place the app owns an AudioContext, a
// player, and the normalized set.
//
// The gesture gate lives here. Browsers refuse to
// start an AudioContext outside a user gesture, and a
// tool that fails silently at that point looks
// broken — so the page loads "armed but not started",
// and the first click in the preview both starts the
// context and fires the sound that was clicked, so
// the first interaction is never swallowed.
//
// Note the tool's default differs from the export's,
// deliberately. Here, sound comes on at the first
// gesture: making sound is the entire point of the
// page. In the exported runtime it stays off until an
// app opts in. Different defaults, different reasons,
// and they must not be collapsed.
// ==============================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createBeeps, type BeepsConfig, type BeepsPlayer } from "../runtime/beeps.js"
import { canRender, normalizeSet } from "./render.js"
import { encodeWav, toDataUri } from "./wav.js"
import type { Sound, SoundId, SoundSet } from "./sounds.js"

/**
 * A fifth of a second of digital silence, as a data URI.
 *
 * Built from the WAV encoder this tool already ships rather than added as an
 * asset — the repo has no audio files and should not gain one for this. 8 kHz
 * mono keeps it around 3 KB, and it is generated from zeros at runtime so it
 * costs the bundle nothing but the call.
 */
function silentWav(): string {
  const rate = 8000
  return toDataUri(
    encodeWav(new Float32Array(Math.round(rate * 0.2)), {
      sampleRate: rate,
      channels: 1,
      bitDepth: 16,
    }),
  )
}

export type AudioState = {
  /** The set with measured gains folded in, or the raw set until that lands. */
  set: SoundSet
  /** False until a user gesture has started the context. */
  started: boolean
  /** The user's own mute, independent of whether the context has started. */
  muted: boolean
  setMuted: (v: boolean) => void
  /** Play a sound, starting the context first if this is the opening gesture. */
  play: (id: SoundId) => void
  /** Play a sound from outside the current set — see the audition control. */
  playOne: (sound: Sound) => void
  playSequence: (ids: SoundId[], gapMs: number) => void
  /** True while normalization is still rendering. */
  measuring: boolean
}

export function useAudio(rawSet: SoundSet): AudioState {
  const [set, setSet] = useState(rawSet)
  const [started, setStarted] = useState(false)
  const [muted, setMuted] = useState(false)
  const [measuring, setMeasuring] = useState(false)

  // Re-measure whenever the set changes. Rendering eleven sounds offline is a
  // few milliseconds of work, but it is async — so a result from a previous
  // set can land after a newer one. The `current` guard is what stops a stale
  // normalization being applied to a set the visitor has already moved past.
  useEffect(() => {
    if (!canRender()) {
      setSet(rawSet)
      return
    }
    let current = true
    setMeasuring(true)
    normalizeSet(rawSet)
      .then((normalized) => current && setSet(normalized))
      .catch(() => current && setSet(rawSet))
      .finally(() => {
        if (current) setMeasuring(false)
      })
    return () => {
      current = false
    }
  }, [rawSet])

  const sounds = useMemo(
    () =>
      Object.fromEntries(set.sounds.map((s) => [s.id, s])) as Partial<Record<SoundId, Sound>>,
    [set],
  )

  // ONE config object and ONE player for the life of the page.
  //
  // The player reads `config.sounds` on every call, so keeping the same object
  // and refreshing its contents means an edit is heard immediately without
  // building a new AudioContext. That matters: browsers cap how many contexts
  // a document may create, and a tool that rebuilt one per keystroke would hit
  // the cap within a minute of use and then go silent with no error.
  const configRef = useRef<BeepsConfig>({ baseHz: set.baseHz, sounds })
  configRef.current.sounds = sounds
  configRef.current.baseHz = set.baseHz

  const playerRef = useRef<BeepsPlayer | null>(null)
  const ensure = useCallback((): BeepsPlayer => {
    if (!playerRef.current) playerRef.current = createBeeps(configRef.current)
    return playerRef.current
  }, [])

  /**
   * Make iOS follow the volume buttons instead of the Ring/Silent switch.
   *
   * Safari starts a page in the "ambient" audio session category, which the
   * hardware switch mutes outright — so on a phone set to silent this tool was
   * completely dead, with no error and nothing on screen to explain it. Playing
   * an HTMLAudioElement promotes the page to the "playback" category, and from
   * then on Web Audio is governed by the media volume like any other media.
   *
   * Deliberately fired only once we are actually about to make sound: past the
   * mute gate, inside the same user gesture. Promoting the session on page load
   * would be the exact overreach the mute gate exists to prevent.
   *
   * The element is kept in a ref rather than dropped on the floor. A collected
   * element can take the promotion with it, and the failure would look like the
   * bug coming back at random.
   *
   * Not in `src/runtime/beeps.js`. This is the tool's own call — you came here
   * to audition sounds, so the switch should not gate that. An app that embeds
   * the exported runtime may well want a notification to stay silent when the
   * phone is on silent, and that decision is theirs to make.
   */
  const unlockedRef = useRef(false)
  const silenceRef = useRef<HTMLAudioElement | null>(null)
  const unlockSilentSwitch = useCallback(() => {
    if (unlockedRef.current || typeof Audio === "undefined") return
    unlockedRef.current = true
    try {
      const el = new Audio(silentWav())
      // iOS refuses inline playback without this and opens the fullscreen
      // player instead, which would be a very loud way to play silence.
      el.setAttribute("playsinline", "")
      silenceRef.current = el
      // A rejection just means the promotion did not happen — the tool still
      // works with the switch off, so there is nothing to report.
      void el.play()?.catch(() => {})
    } catch {
      /* No Audio constructor. Nothing to promote, nothing to do. */
    }
  }, [])

  /** Start on the opening gesture, then honour the mute. Returns false if silent. */
  const arm = useCallback((): BeepsPlayer | null => {
    const player = ensure()
    if (!started) {
      player.enable()
      setStarted(true)
    }
    if (muted) return null
    unlockSilentSwitch()
    player.enabled = true
    return player
  }, [ensure, started, muted, unlockSilentSwitch])

  const play = useCallback((id: SoundId) => arm()?.play(id), [arm])

  const playOne = useCallback((sound: Sound) => arm()?.playOne(sound), [arm])

  const playSequence = useCallback(
    (ids: SoundId[], gapMs: number) => arm()?.playSequence(ids, gapMs),
    [arm],
  )

  useEffect(() => {
    return () => {
      playerRef.current?.dispose()
      playerRef.current = null
    }
  }, [])

  return { set, started, muted, setMuted, play, playOne, playSequence, measuring }
}
