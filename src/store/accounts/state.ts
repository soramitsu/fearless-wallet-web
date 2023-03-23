import type { SelectedWallet, Accounts, SelectedNetworks, AutoSelectNode } from './types';
import type { NetworkName } from '@/interfaces';
import { accountController } from '@/controllers';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  isOnline: boolean;
  accounts: Accounts;
  addresses: Accounts;
  autoSelectNode: AutoSelectNode;
  isCustomSort: Record<string, boolean>;
  hideWarningNetworks: NetworkName[];
  qr: string | null;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: accountController.getSelectedNetwork(),
    isOnline: navigator.onLine,
    accounts: {},
    addresses: {},
    isCustomSort: accountController.getCustomSort(),
    autoSelectNode: accountController.getAutoSelectNodesValue(),
    hideWarningNetworks: accountController.getHideWarningNetworks(),
    qr: null,
  };
};

export default state;
