import type { AccountJson } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';
import { isRecoveryOnlyWallet } from '@/util/walletSecurity';

const isEvmAccount = (account: AccountJson): boolean =>
  account.type === 'ethereum' || account.walletEcosystem === WalletEcosystem.Evm || /^0x[0-9a-f]{40}$/i.test(account.address);

/** Every pre-update local wallet lacks the fresh-root security marker. */
export function getLegacyWalletUpgradeAccounts(accounts: AccountJson[]): AccountJson[] {
  // Match actual parent links rather than hiding all standalone EVM accounts.
  const linkedEthereumAddresses = new Set(accounts
    .filter((account) => typeof account.address === 'string' && account.address.trim() && !isEvmAccount(account))
    .map((account) => account.ethereumAddress?.toLowerCase())
    .filter(Boolean));

  return accounts.filter((account) => {
    if (typeof account.address !== 'string' || !account.address.trim()) return false;
    if (account.isExternal || account.isHardware || account.isInjected || account.isMobile ||
      account.isReadOnly || account.isWatchOnly || account.noPublicKey) return false;
    if (isEvmAccount(account) && linkedEthereumAddresses.has(account.address.toLowerCase())) return false;

    return isRecoveryOnlyWallet(account);
  });
}

// The security dialog opens once for each affected wallet on this device. Its
// recovery banner stays on that wallet's pages and can reopen the guidance.
const CLOSED_NOTICES_STORAGE_KEY = 'fearless:legacy-wallet-upgrade-notice:v2';

export function readClosedLegacyWalletNotices(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CLOSED_NOTICES_STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((address): address is string => typeof address === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberClosedLegacyWalletNotices(addresses: string[]): void {
  try {
    localStorage.setItem(CLOSED_NOTICES_STORAGE_KEY, JSON.stringify(addresses));
  } catch {
    // Without storage the dialog still stays closed until the extension reopens.
  }
}
