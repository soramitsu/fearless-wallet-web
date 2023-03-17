import type { SelectedWallet, Accounts, SelectedNetworks, AutoSelectNode } from './types';
import { accountController } from '@/controllers/accountController';
import { SORA_CARD_BANNER_RERUN } from '@/consts/global';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  isOnline: boolean;
  accounts: Accounts;
  addresses: Accounts;
  autoSelectNode: AutoSelectNode;
  showSoraCardBanner: boolean;
  isCustomSort: Record<string, boolean>;
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
    showSoraCardBanner: Date.now() - accountController.getHidingSoraBannerTime() >= SORA_CARD_BANNER_RERUN,
    qr: null,
  };
};

export default state;
