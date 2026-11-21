import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SOUND_EFFECTS_KEY,
  onSoundEffectsChange,
  setSoundEffectsEnabled,
  soundEffectsEnabled,
} from '@/feel/soundPreference';

// Brand kit v3 SPEC part 2: "Sound effects", on by default, in ordinary page storage.
describe('the sound effects preference', () => {
  beforeEach(() => localStorage.clear());

  it('is on by default and when storage cannot be read', () => {
    expect(soundEffectsEnabled()).toBe(true);
    expect(soundEffectsEnabled({ getItem: () => { throw new Error('blocked'); } })).toBe(true);
  });

  it('remembers the choice and tells the listeners, in this page and from another wallet page', () => {
    const seen: boolean[] = [];
    const stop = onSoundEffectsChange((enabled) => seen.push(enabled));

    setSoundEffectsEnabled(false);
    expect(localStorage.getItem(SOUND_EFFECTS_KEY)).toBe('off');
    expect(soundEffectsEnabled()).toBe(false);
    window.dispatchEvent(new StorageEvent('storage', { key: SOUND_EFFECTS_KEY, newValue: 'on' }));
    stop();
    setSoundEffectsEnabled(true);

    expect(seen).toEqual([false, true]);
    expect(soundEffectsEnabled()).toBe(true);
  });

  it('keeps the choice for the page when storage cannot be written', () => {
    const seen: boolean[] = [];
    const stop = onSoundEffectsChange((enabled) => seen.push(enabled));
    setSoundEffectsEnabled(false, { setItem: () => { throw new Error('full'); } });
    stop();
    expect(seen).toEqual([false]);
  });
});

describe('playing a transfer sound', () => {
  let started: number;
  let contextState: AudioContextState;

  class FakeOffline {
    decodeAudioData = vi.fn(async () => ({ duration: 0.8 }) as unknown as AudioBuffer);
  }
  class FakeContext {
    get state() {
      return contextState;
    }
    destination = {};
    resume = vi.fn(() => new Promise<void>(() => undefined));
    createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: () => (started += 1) });
  }

  const load = async () => {
    vi.resetModules();
    return import('@/feel/sound');
  };

  beforeEach(() => {
    started = 0;
    contextState = 'running';
    localStorage.clear();
    vi.stubGlobal('OfflineAudioContext', FakeOffline);
    vi.stubGlobal('AudioContext', FakeContext);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays the send sound from the bytes shipped in the page, and says so', async () => {
    const { playSound, dataUrlBytes } = await load();
    const heard = vi.fn();
    window.addEventListener('fw:sound', heard, { once: true });

    expect(await playSound('send')).toEqual({ played: true, name: 'send' });
    expect(started).toBe(1);
    expect(heard).toHaveBeenCalledOnce();
    expect(dataUrlBytes('data:audio/mp4;base64,AAEC').byteLength).toBe(3);
  });

  it('plays nothing when sound effects are off', async () => {
    const { playSound } = await load();
    setSoundEffectsEnabled(false);

    expect(await playSound('receive')).toEqual({ played: false, name: 'receive', reason: 'off' });
    expect(started).toBe(0);
  });

  it('skips the sound, never queues it, when the browser has not let the page play yet', async () => {
    contextState = 'suspended';
    const { playSound } = await load();

    expect(await playSound('receive')).toEqual({ played: false, name: 'receive', reason: 'blocked' });
    contextState = 'running';
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(started).toBe(0);
  });

  it('plays nothing from a hidden page or where there is no Web Audio', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    let sound = await load();
    expect(await sound.playSound('send')).toMatchObject({ played: false, reason: 'hidden' });
    hidden.mockRestore();

    vi.stubGlobal('AudioContext', undefined);
    sound = await load();
    expect(await sound.playSound('send')).toMatchObject({ played: false, reason: 'unsupported' });
  });
});
