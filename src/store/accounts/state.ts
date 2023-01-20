import type { SelectedWallet, Accounts, SelectedNetworks, AutoSelectNode } from './types';
import { accountController } from '@/controllers/accountController';
import { BalanceItem } from '@/extension/background/extension-base/src/api/evm/types/ether';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  isOnline: boolean;
  accounts: Accounts;
  addresses: Accounts;
  balance: Record<string, BalanceItem>;
  autoSelectNode: AutoSelectNode;
  qr: string | null;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: accountController.getSelectedNetwork(),
    isOnline: navigator.onLine,
    accounts: {},
    balance: {},
    addresses: {},
    autoSelectNode: accountController.getAutoSelectNodesValue(),
    qr: null,
  };
};

export default state;
