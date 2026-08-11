// ==============================================
// BEEPS RUNTIME — TYPES
// Types for beeps.js, which is plain JavaScript on
// purpose: the JS export ships its source verbatim,
// so it cannot carry TypeScript syntax.
//
// This file exists so the rest of the app still gets
// checked when it imports the runtime. It is not
// exported to users — they get the .js.
// ==============================================
import type { Envelope, Sound, SoundId } from "../lib/sounds.js"

export type EnvelopeSegments = {
  attack: number
  decay: number
  sustainTime: number
  release: number
  /** Everything audible, including the final ramp to true zero. */
  totalMs: number
}

export function envelopeSegments(env: Envelope, durationMs: number): EnvelopeSegments

export function scheduleSound(
  ctx: BaseAudioContext,
  destination: AudioNode,
  sound: Sound,
  when: number,
  onVoice?: (node: AudioScheduledSourceNode, stopAt: number) => void,
): number

export type BeepsConfig = {
  baseHz?: number
  sounds: Partial<Record<SoundId, Sound>>
}

export type BeepsOptions = {
  context?: BaseAudioContext
  enabled?: boolean
}

export type BeepsPlayer = {
  enable(): BeepsPlayer
  disable(): BeepsPlayer
  enabled: boolean
  play(id: SoundId | string): boolean
  playOne(sound: Sound): boolean
  playSequence(ids: (SoundId | string)[], gapMs?: number): boolean
  dispose(): void
}

export function createBeeps(config: BeepsConfig, options?: BeepsOptions): BeepsPlayer
