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
  isCustomSort: Record<string, boolean>;
  qr: string | null;
  showPolkaswapAlert: boolean;
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
    showPolkaswapAlert: !accountController.getAgreeSwapDisclaimer(),
    qr: null,
  };
};

export default state;
