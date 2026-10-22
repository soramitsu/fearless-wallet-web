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
