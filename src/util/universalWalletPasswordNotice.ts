import { ref } from 'vue';
import type { UniversalWalletPasswordStatus } from '@extension-base/background/types/types';

// The notice opens by itself once per wallet on this device; wallet details can open it again.
const CLOSED_NOTICES_STORAGE_KEY = 'fearless:universal-wallet-password-notice:v1';

/** A wallet whose notice was asked for again (wallet details), until the notice takes it. */
export const universalWalletPasswordNoticeRequest = ref<string | null>(null);

export function needsUniversalWalletPasswordNotice(status: UniversalWalletPasswordStatus | undefined): boolean {
  return (status?.state === 'legacy' && (status.rows.length > 0 || !!status.arrived?.length)) ||
    status?.state === 'password-unknown';
}

export function readClosedUniversalWalletPasswordNotices(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CLOSED_NOTICES_STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((address): address is string => typeof address === 'string') : [];
  } catch {
    return [];
  }
}

/** Something new happened at an old address: the notice may open by itself again. */
export function forgetClosedUniversalWalletPasswordNotice(address: string): void {
  try {
    const closed = readClosedUniversalWalletPasswordNotices();
    if (closed.includes(address)) {
      localStorage.setItem(CLOSED_NOTICES_STORAGE_KEY, JSON.stringify(closed.filter((item) => item !== address)));
    }
  } catch {
    // Without storage nothing was remembered.
  }
}

export function rememberClosedUniversalWalletPasswordNotice(address: string): void {
  try {
    const closed = readClosedUniversalWalletPasswordNotices();
    if (!closed.includes(address)) localStorage.setItem(CLOSED_NOTICES_STORAGE_KEY, JSON.stringify([...closed, address]));
  } catch {
    // Without storage the notice still stays closed until the extension reopens.
  }
}
