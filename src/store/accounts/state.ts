import type { SelectedWallet, Accounts, SelectedNetworks, AutoSelectNode } from './types';
import type { NetworkName } from '@/interfaces';
import { SORA_CARD_BANNER_RERUN } from '@/consts/global';
import { accountController } from '@/controllers';

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
  hideWarningNetworks: NetworkName[];
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
    showSoraCardBanner: Date.now() - accountController.getHidingSoraCardBannerTime() >= SORA_CARD_BANNER_RERUN,
    showPolkaswapAlert: !accountController.getAgreeSwapDisclaimer(),
    hideWarningNetworks: accountController.getHideWarningNetworks(),
    qr: null,
  };
};

export default state;
