import { isEthereumAddress } from '@polkadot/util-crypto';
import type { CurrentAccountInfo } from '@extension-base/stores/CurrentAccountStore';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

export interface MainAccount {
  address: string;
  meta: FWKeyringMeta;
}

// Lower is preferred. `State.updateCurrentAccount` refuses EVM addresses, so a standalone
// EVM account is chosen only when nothing else remains.
const preference = ({ address, meta }: MainAccount): number => {
  if (isEthereumAddress(address)) return 3;

  const walletEcosystem = meta.walletEcosystem ?? WalletEcosystem.Substrate;

  if (walletEcosystem === WalletEcosystem.Substrate) return 0;
  if (walletEcosystem === WalletEcosystem.Ton) return 1;

  return 2;
};

/** The account to select when none is selected or the selected one was removed: the first
 * Substrate account, then the first TON account, then any other non-EVM account, and a
 * standalone EVM account only when it is the last kind left. */
export function pickDefaultCurrentAccount<T extends MainAccount>(accounts: T[]): T | undefined {
  return accounts.reduce<T | undefined>(
    (picked, account) => (!picked || preference(account) < preference(picked) ? account : picked),
    undefined
  );
}

/** The current-account record `State.onInstall` stores for an entry of `getAllMainAccounts()`. */
export function toCurrentAccountInfo({ address, meta }: MainAccount): CurrentAccountInfo {
  const {
    name,
    ethereumAddress,
    isMobile,
    bitcoinAddress,
    bitcoinTestnetAddress,
    solanaAddress,
    irohaAddress,
    irohaPublicKeyHex,
    walletEcosystem,
  } = meta;

  return {
    address,
    name: name!,
    ethereumAddress: ethereumAddress!,
    bitcoinAddress,
    bitcoinTestnetAddress,
    solanaAddress,
    irohaAddress,
    irohaPublicKeyHex,
    isMobile: isMobile!,
    walletEcosystem: walletEcosystem!,
  };
}
