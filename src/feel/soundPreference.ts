// "Sound effects" in Settings (brand kit v3, SPEC "Launch, feel and sound" part 2): on by default, kept in ordinary
// page storage shared by the popup, the side panel and full tabs, never with keys or wallet records.
export const SOUND_EFFECTS_KEY = 'fearless-sound-effects';

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

export function soundEffectsEnabled(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(SOUND_EFFECTS_KEY) !== 'off';
  } catch {
    // Storage that is missing or throws reads as the default.
    return true;
  }
}

export function setSoundEffectsEnabled(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(SOUND_EFFECTS_KEY, enabled ? 'on' : 'off');
  } catch {
    // The choice then lasts for this page only.
  }
  listeners.forEach((listener) => listener(enabled));
}

/** Calls back when this page changes the choice, and when another wallet page of the extension does. */
export function onSoundEffectsChange(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOUND_EFFECTS_KEY) listener(event.newValue !== 'off');
  };
  globalThis.addEventListener?.('storage', onStorage);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener?.('storage', onStorage);
  };
}
