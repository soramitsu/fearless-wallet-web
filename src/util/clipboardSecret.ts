// A recovery phrase or private key copied to the clipboard must not stay there: other apps read the clipboard, and
// clipboard history or Universal Clipboard can keep or sync it. The copy is cleared after a minute, when its screen
// closes, and, if the wallet closed before that, the next time the wallet opens. Only a SHA-256 of the copied text is
// remembered, in memory-only extension session storage; the clipboard is cleared only while it still holds that text.
export const SECRET_CLIPBOARD_MARKER = 'fearless:copied-secret-sha256';
export const SECRET_CLIPBOARD_LIFETIME_MS = 60_000;

let timer: ReturnType<typeof setTimeout> | undefined;
// This page's own copy, for the web wallet, which has no extension session storage.
let copiedHere: string | undefined;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sessionStorage(): chrome.storage.StorageArea | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome?.storage?.session;
}

/** Copies `secret` and arranges for the clipboard to be cleared again. */
export async function copySecretToClipboard(secret: string): Promise<void> {
  if (!secret || !navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(secret);
  copiedHere = await sha256(secret);
  try {
    await sessionStorage()?.set({ [SECRET_CLIPBOARD_MARKER]: copiedHere });
  } catch {
    // Without session storage the copy is still cleared by the timer and when the screen closes.
  }
  clearTimeout(timer);
  timer = setTimeout(() => void clearCopiedSecret(), SECRET_CLIPBOARD_LIFETIME_MS);
}

/**
 * Empties the clipboard if it still holds the last copied secret. Reading the clipboard needs a focused wallet page
 * (and the extension's clipboardRead permission); when that fails the marker stays for the next attempt. Anything
 * the user copied since is left alone.
 */
export async function clearCopiedSecret(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;

  let expected: unknown;

  try {
    expected = (await sessionStorage()?.get(SECRET_CLIPBOARD_MARKER))?.[SECRET_CLIPBOARD_MARKER] ?? copiedHere;
  } catch {
    expected = copiedHere;
  }
  if (typeof expected !== 'string' || !navigator.clipboard?.readText) return;

  let current: string;

  try {
    current = await navigator.clipboard.readText();
  } catch {
    return;
  }
  if (current && (await sha256(current)) === expected) {
    try {
      await navigator.clipboard.writeText('');
    } catch {
      return;
    }
  }
  copiedHere = undefined;
  try {
    await sessionStorage()?.remove(SECRET_CLIPBOARD_MARKER);
  } catch {
    // The next attempt finds the clipboard no longer holding the secret and removes the marker then.
  }
}
