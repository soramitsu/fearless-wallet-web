// The wallet's two transfer sounds (brand kit v3: audio/send.m4a, audio/receive.m4a, synthesised for the kit). Only
// visible wallet pages import this module; the background worker never plays anything.
//
// The files ship inside this chunk and are decoded ahead of the first use with an OfflineAudioContext, so neither the
// page's media nor its connect policy is involved and the first send does not wait for a decode. A browser that does
// not let the page play sound yet (no click on it so far) refuses quietly: the sound is skipped, never queued.
import sendData from '@/assets/brand/audio/send.m4a?inline';
import receiveData from '@/assets/brand/audio/receive.m4a?inline';
import { soundEffectsEnabled } from '@/feel/soundPreference';

export type SoundName = 'send' | 'receive';
export type SoundOutcome =
  | { played: true; name: SoundName }
  | { played: false; name: SoundName; reason: 'off' | 'hidden' | 'unsupported' | 'blocked' | 'failed' };

const SOURCES: Record<SoundName, string> = { send: sendData, receive: receiveData };
/** How long a suspended context may take to start before the sound is skipped. */
const RESUME_WAIT_MS = 150;

type AudioContextClass = typeof AudioContext;
type OfflineContextClass = typeof OfflineAudioContext;
const contextClass = (): AudioContextClass | undefined =>
  (globalThis as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass }).AudioContext ??
  (globalThis as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
const offlineClass = (): OfflineContextClass | undefined =>
  (globalThis as { OfflineAudioContext?: OfflineContextClass }).OfflineAudioContext;

export function dataUrlBytes(url: string): ArrayBuffer {
  const comma = url.indexOf(',');
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const buffers = new Map<SoundName, Promise<AudioBuffer | undefined>>();
let context: AudioContext | undefined;

/** Decodes a sound once, without opening an audio output. */
export function prepareSound(name: SoundName): Promise<AudioBuffer | undefined> {
  let buffer = buffers.get(name);
  if (!buffer) {
    const Offline = offlineClass();
    buffer = Offline
      ? new Offline(2, 1, 48000).decodeAudioData(dataUrlBytes(SOURCES[name])).catch(() => undefined)
      : Promise.resolve(undefined);
    buffers.set(name, buffer);
  }
  return buffer;
}

/** Decodes both sounds when the page has a moment to spare. */
export function prepareSounds(): void {
  const run = () => void Promise.all([prepareSound('send'), prepareSound('receive')]);
  const idle = (globalThis as { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}

const report = (outcome: SoundOutcome): SoundOutcome => {
  // For checks and screenshots: what the last request did, and an event a harness can wait for.
  (globalThis as { __fwSound?: SoundOutcome & { at: number; contextState?: string } }).__fwSound = {
    ...outcome,
    at: Date.now(),
    contextState: context?.state,
  };
  globalThis.dispatchEvent?.(new CustomEvent('fw:sound', { detail: outcome }));
  return outcome;
};

export async function playSound(name: SoundName): Promise<SoundOutcome> {
  if (!soundEffectsEnabled()) return report({ played: false, name, reason: 'off' });
  if (globalThis.document?.hidden) return report({ played: false, name, reason: 'hidden' });
  const Context = contextClass();
  if (!Context) return report({ played: false, name, reason: 'unsupported' });
  try {
    const buffer = await prepareSound(name);
    if (!buffer) return report({ played: false, name, reason: 'failed' });
    context ??= new Context();
    if (context.state === 'suspended') {
      await Promise.race([context.resume().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, RESUME_WAIT_MS))]);
    }
    if (context.state !== 'running') return report({ played: false, name, reason: 'blocked' });
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    return report({ played: true, name });
  } catch {
    return report({ played: false, name, reason: 'failed' });
  }
}
