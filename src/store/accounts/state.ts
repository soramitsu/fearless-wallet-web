import type { SelectedWallet, SelectedNetworks, AutoSelectNode } from './types';
import { accountController } from '@/controllers/accountController';
import { BalanceItem } from '@/extension/background/extension-base/src/api/evm/types/ether';
import { AccountJson } from '@/extension/background/extension-base/src/background/types';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  accounts: AccountJson[];
  isOnline: boolean;
  balance: Record<string, Record<string, BalanceItem>>;
  autoSelectNode: AutoSelectNode;
  isCustomSort: Record<string, boolean>;
  qr: string | null;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: accountController.getSelectedNetwork(),
    isOnline: navigator.onLine,
    balance: {},
    accounts: accountController.getAccounts(),
    isCustomSort: accountController.getCustomSort(),
    autoSelectNode: accountController.getAutoSelectNodesValue(),
    qr: null,
  };
};

export default state;
