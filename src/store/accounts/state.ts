import type { SelectedWallet, SelectedNetworks, AutoSelectNode } from './types';
import { accountController } from '@/controllers/accountController';
import { AccountJson, TokenBalance } from '@/extension/background/extension-base/src/background/types';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  accounts: AccountJson[];
  isOnline: boolean;
  balances: Record<string, TokenBalance>;
  hiddenAssets: string[];
  autoSelectNode: AutoSelectNode;
  isCustomSort: Record<string, boolean>;
  qr: string | null;
};

const state = (): State => {
  return {
    selectedWallet: accountController.getSelectedWallet(),
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: accountController.getSelectedNetwork(),
    isOnline: navigator.onLine,
    balances: {},
    hiddenAssets: [],
    accounts: accountController.getAccounts(),
    isCustomSort: accountController.getCustomSort(),
    autoSelectNode: accountController.getAutoSelectNodesValue(),
    qr: null,
  };
};

export default state;
