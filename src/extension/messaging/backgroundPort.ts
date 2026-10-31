import { PORT_EXTENSION } from '@extension-base/defaults';
import { chrome } from '@extension-base/utils/crossenv';
import type { Port } from '@extension-base/background/types/types';

let opened: Port | undefined;

/**
 * Connects a wallet page to the background before the app's code has loaded, so a stopped service worker starts
 * while the page loads instead of after it. The messaging module takes this connection over (takeBackgroundPort).
 */
export function openBackgroundPort(): void {
  if (opened) return;
  const port = chrome.runtime?.connect({ name: PORT_EXTENSION });
  if (!port) return;
  opened = port;
  // A connection that closes before it is taken over is dropped: its disconnect would go unseen.
  port.onDisconnect.addListener(() => { if (opened === port) opened = undefined; });
}

/** The connection openBackgroundPort made, if it is still open. It is handed over once. */
export function takeBackgroundPort(): Port | undefined {
  const port = opened;
  opened = undefined;
  return port;
}
