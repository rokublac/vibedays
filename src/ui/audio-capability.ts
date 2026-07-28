/**
 * iOS and iPadOS make HTMLMediaElement.volume read-only: the assignment is
 * accepted and then ignored, so the Web Playback SDK's setVolume does nothing
 * and a slider would move while the sound stayed put. Probed rather than
 * sniffed from the user agent, so this stays correct as platforms change.
 */
export function canSetVolume(
  makeAudio: () => HTMLAudioElement = () => new Audio(),
): boolean {
  try {
    const el = makeAudio()
    el.volume = 0.5
    return el.volume === 0.5
  } catch {
    // No Audio constructor at all (or a hostile one) is not a platform we can
    // control the volume on either.
    return false
  }
}
