import type { SelectedWallet, SelectedNetworks, AutoSelectNode } from './types';
import type { NetworkName, WalletAddress } from '@/interfaces';
import { accountController } from '@/controllers';
import { AccountJson, TokenBalance } from '@/extension/background/extension-base/src/background/types/types';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  accounts: AccountJson[];
  isOnline: boolean;
  balances: TokenBalance[];
  hiddenAssets: Record<WalletAddress, string[]>;
  autoSelectNode: AutoSelectNode;
  isCustomSort: Record<string, boolean>;
  hideWarningNetworks: NetworkName[];
  qr: string | null;
  showPolkaswapAlert: boolean;
};

const state = (): State => {
  return {
    selectedWallet: accountController.getSelectedWallet(),
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: accountController.getSelectedNetwork(),
    isOnline: navigator.onLine,
    balances: [],
    hiddenAssets: accountController.getHiddenAssets(),
    accounts: accountController.getAccounts(),
    isCustomSort: accountController.getCustomSort(),
    autoSelectNode: accountController.getAutoSelectNodesValue(),
    showPolkaswapAlert: !accountController.getAgreeSwapDisclaimer(),
    hideWarningNetworks: accountController.getHideWarningNetworks(),
    qr: null,
  };
};

export default state;
