import type { SelectedWallet, Accounts, SelectedNetworks, AutoSelectNode } from './types';
import { accountController } from '@/controllers/accountController';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  isOnline: boolean;
  accounts: Accounts;
  addresses: Accounts;
  autoSelectNode: AutoSelectNode;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: accountController.getSelectedNetwork(),
    isOnline: navigator.onLine,
    accounts: {},
    addresses: {},
    autoSelectNode: accountController.getAutoSelectNodesValue(),
  };
};

export default state;
