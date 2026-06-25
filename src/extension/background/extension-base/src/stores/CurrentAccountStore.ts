import { EXTENSION_PREFIX } from '@extension-base/defaults';
import SubscribableStore from '@extension-base/stores/SubscribableStore';
import type { WalletEcosystem } from '@/interfaces';

export interface CurrentAccountInfo {
  address: string;
  ethereumAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  irohaPublicKeyHex?: string;
  name: string;
  isMobile: boolean;
  walletEcosystem: WalletEcosystem;
}

export type CurrentAccountState = CurrentAccountInfo | null;

export default class CurrentAccountStore extends SubscribableStore<CurrentAccountState> {
  constructor() {
    super(EXTENSION_PREFIX ? `${EXTENSION_PREFIX}current_account` : null);
  }
}
