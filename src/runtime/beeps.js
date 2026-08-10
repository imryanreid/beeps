// ==============================================
// BEEPS RUNTIME
// The synthesis itself. Plain JavaScript, no
// imports, no framework, no dependencies.
//
// This is the ONLY implementation. The tool runs it
// to play and to render; the JS export ships this
// exact source. There is deliberately no second,
// template-generated copy of the synthesis logic to
// drift out of step with what you heard.
//
// The same function builds the live graph and the
// offline one, so a downloaded WAV cannot disagree
// with the preview.
// ==============================================

/**
 * An exponential ramp can approach zero but never reach it, so every fade
 * targets this and then takes a short linear step to true silence.
 */
const EPSILON = 0.0001

/** The final linear ramp to true zero, in seconds. Without it, the end clicks. */
const TAIL_S = 0.002

/** Web Audio throws on an exponential ramp to zero or below. */
const MIN_HZ = 20

/**
 * Simultaneous SOUNDS before the oldest is released — not voices.
 *
 * A preset stacks layers, so one `success` on Glassy is six oscillators plus a
 * noise burst. Capping raw node count would have cut rapid-fire off after two
 * plays on exactly the presets with the most going on, which is the opposite
 * of what the test is for.
 */
const MAX_SOUNDS = 16

/**
 * How an envelope divides up its time, in milliseconds.
 *
 * Duration is a *budget*, not a mandate. A percussive one-shot — which is
 * every sound here, since `sustain` is 0 throughout — is over once it has
 * decayed, so it is not padded out to fill the budget with silence. Only a
 * sound that actually sustains holds, and only for whatever the budget has
 * left.
 *
 * Exported because resolve.ts imports it: the duration warning has to measure
 * the same thing the synthesis plays, and two copies of this arithmetic would
 * disagree the first time either changed.
 */
export function envelopeSegments(env, durationMs) {
  const attack = env.attackMs
  const decay = env.decayMs
  const release = env.releaseMs
  const sustainTime = env.sustain > 0 ? Math.max(0, durationMs - attack - decay - release) : 0
  return {
    attack,
    decay,
    sustainTime,
    release,
    /** Everything audible, including the ramp to true zero. */
    totalMs: attack + decay + sustainTime + release + TAIL_S * 1000,
  }
}

/**
 * One short buffer of white noise per context, made once and reused.
 *
 * Regenerating per trigger is audible as a slight variation between otherwise
 * identical plays, and wasteful when rapid-fire fires ten of them in a second.
 */
const noiseCache = new WeakMap()

function noiseBuffer(ctx) {
  let buffer = noiseCache.get(ctx)
  if (buffer) return buffer
  const frames = Math.ceil(ctx.sampleRate * 0.5)
  buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
  noiseCache.set(ctx, buffer)
  return buffer
}

const clampHz = (hz) => Math.max(MIN_HZ, Math.min(20000, hz))

/** How many jumps a stepped glide takes. Few enough to hear individually. */
const STEPS = 5

/**
 * Schedule one sound on a context, live or offline.
 *
 * Returns the time it finishes, so an offline render knows how long a buffer
 * to allocate and a sequence knows when the next one may start.
 *
 * The envelope ordering here is the part that is easy to get wrong, and each
 * step has an audible failure mode rather than a thrown error:
 *
 *   - the attack ramps LINEARLY from a true zero, because
 *     `exponentialRampToValueAtTime` cannot start at zero and silently does
 *     nothing at all — the usual way a Web Audio envelope ends up with no
 *     attack;
 *   - decay and release ramp EXPONENTIALLY, because amplitude perception is
 *     logarithmic and a linear fade sounds like it stops rather than fades;
 *   - the very end takes a short LINEAR step to true zero, because an
 *     exponential never arrives and cutting a node at a non-zero amplitude
 *     clicks.
 */
export function scheduleSound(ctx, destination, sound, when, onVoice) {
  const t0 = when

  const filter = ctx.createBiquadFilter()
  filter.type = sound.filter.type
  filter.frequency.setValueAtTime(clampHz(sound.filter.cutoffHz), t0)
  filter.Q.setValueAtTime(sound.filter.q, t0)

  const master = ctx.createGain()
  master.gain.setValueAtTime(sound.normalizedGain, t0)

  filter.connect(master)
  master.connect(destination)

  let endsAt = t0

  for (const voice of sound.voices) {
    const start = t0 + voice.startOffsetMs / 1000
    const seg = envelopeSegments(voice.env, sound.durationMs)

    const attackEnd = start + seg.attack / 1000
    const decayEnd = attackEnd + seg.decay / 1000
    const releaseStart = decayEnd + seg.sustainTime / 1000
    const releaseEnd = releaseStart + seg.release / 1000
    const stopAt = releaseEnd + TAIL_S

    const peak = Math.max(EPSILON, voice.gain)
    const sustainLevel = Math.max(EPSILON, voice.gain * voice.env.sustain)

    const env = ctx.createGain()
    const g = env.gain
    g.setValueAtTime(0, start)
    g.linearRampToValueAtTime(peak, attackEnd)
    g.exponentialRampToValueAtTime(sustainLevel, decayEnd)
    if (seg.sustainTime > 0) g.setValueAtTime(sustainLevel, releaseStart)
    g.exponentialRampToValueAtTime(EPSILON, releaseEnd)
    g.linearRampToValueAtTime(0, stopAt)
    env.connect(filter)

    let node
    if (voice.kind === "noise") {
      node = ctx.createBufferSource()
      node.buffer = noiseBuffer(ctx)
    } else {
      node = ctx.createOscillator()
      node.type = voice.waveform
      // Cents, for the beating that makes a stack sound warm rather than loud.
      if (voice.detuneCents && node.detune) {
        node.detune.setValueAtTime(voice.detuneCents, start)
      }
      const f = node.frequency
      const from = clampHz(voice.pitch.startHz)
      const to = clampHz(voice.pitch.endHz)
      const sweepS = Math.max(0.001, voice.pitch.sweepMs / 1000)
      f.setValueAtTime(from, start)
      if (to !== from) {
        if (sound.glide === "stepped") {
          // Chiptune hardware wrote pitch to a register, so it jumped rather
          // than slid. Even steps in LOG space, because the steps have to be
          // musical intervals — evenly spaced in Hz they would bunch up at the
          // top and sound like a broken slide instead of an arpeggio.
          for (let i = 1; i <= STEPS; i++) {
            const t = i / STEPS
            f.setValueAtTime(from * Math.pow(to / from, t), start + t * sweepS)
          }
        } else {
          // Exponential, because pitch is logarithmic — a linear sweep from 880
          // to 440 spends most of its time in the top half and sounds wrong.
          f.exponentialRampToValueAtTime(to, start + sweepS)
        }
      }
    }

    node.connect(env)
    node.start(start)
    node.stop(stopAt)

    // OscillatorNode and AudioBufferSourceNode are both single-use. Rapid-fire
    // makes ten of each per second, so they have to be released on the way out
    // or the graph grows for as long as the page is open.
    node.onended = () => {
      try {
        node.disconnect()
        env.disconnect()
      } catch {
        /* already torn down */
      }
    }

    if (onVoice) onVoice(node, stopAt)
    if (stopAt > endsAt) endsAt = stopAt
  }

  return endsAt
}

/**
 * A player bound to one sound set.
 *
 * Sound is OFF until something calls `enable()`. That is not a default anyone
 * should change lightly: a page that makes noise before being asked is the
 * single fastest way to get an app's audio muted permanently, at the OS level,
 * by a user who will never turn it back on.
 *
 * The AudioContext is created on the first `enable()` rather than at
 * construction, because browsers refuse to start one outside a user gesture
 * and a context created too early lands in a suspended state that later
 * `play()` calls silently fall through.
 */
export function createBeeps(config, options) {
  const opts = options || {}

  // Read through to `config` on every call rather than copying `config.sounds`
  // once. A host that edits its set — which the tool does on every keystroke —
  // can then update the same object in place and keep one player, and one
  // AudioContext, for the life of the page. Browsers cap how many contexts a
  // document may create, and rebuilding one per edit reaches that cap quickly.
  const soundsNow = () => config.sounds || {}

  let ctx = opts.context || null
  let enabled = opts.enabled === true
  /** @type {{ nodes: any[], until: number }[]} */
  let active = []

  function context() {
    if (!ctx) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    return ctx
  }

  function reap(now) {
    active = active.filter((v) => v.until > now)
  }

  return {
    /**
     * Turn sound on. Call this from a real user gesture — a click, a key, a
     * tap — or the browser will hand back a suspended context.
     */
    enable() {
      enabled = true
      const c = context()
      if (c && c.state === "suspended") c.resume()
      return this
    },

    disable() {
      enabled = false
      return this
    },

    get enabled() {
      return enabled
    },

    set enabled(v) {
      if (v) this.enable()
      else this.disable()
    },

    /** Play one sound by id. A no-op while disabled, and never throws. */
    play(id) {
      if (!enabled) return false
      const sound = soundsNow()[id]
      if (!sound) return false
      const c = context()
      if (!c) return false
      if (c.state === "suspended") c.resume()

      const now = c.currentTime
      reap(now)

      // Voices overlap rather than cutting each other off — retriggering by
      // stopping the previous instance is a different sound, and it hides the
      // exact problem rapid-fire exists to find. The cap is what stops ten
      // overlapping tails climbing into clipping.
      if (active.length >= MAX_SOUNDS) {
        const oldest = active.shift()
        for (const node of oldest.nodes) {
          try {
            node.stop(now)
          } catch {
            /* already stopped */
          }
        }
      }

      const nodes = []
      const until = scheduleSound(c, c.destination, sound, now, (node) => nodes.push(node))
      active.push({ nodes, until })
      return until > now
    },

    /** Every sound in the set, in order, with a gap between each. */
    playSequence(ids, gapMs) {
      if (!enabled) return false
      const c = context()
      if (!c) return false
      let at = c.currentTime
      const sounds = soundsNow()
      for (const id of ids) {
        const sound = sounds[id]
        if (!sound) continue
        at = Math.max(at, scheduleSound(c, c.destination, sound, at)) + (gapMs || 0) / 1000
      }
      return true
    },

    /** Release the context. Only needed if you create players repeatedly. */
    dispose() {
      if (ctx && !opts.context && typeof ctx.close === "function") ctx.close()
      ctx = null
      active = []
    },
  }
}
