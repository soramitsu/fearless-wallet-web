import type { AvailableNftState, ChainNftState } from '@extension-base/services/nft-service/types';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { SelectedWallet, SelectedNetworks, AutoSelectNode, HiddenAssets } from './types';
import type { NetworkName } from '@/interfaces';
import { accountController } from '@/controllers';
import { SORA_CARD_BANNER_RERUN } from '@/consts/soraCard';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  accounts: AccountJson[];
  balances: TokenGroup[];
  nfts: ChainNftState;
  availableNfts: AvailableNftState;
  hiddenAssetsForAllAccounts: HiddenAssets;
  autoSelectNode: AutoSelectNode;
  isCustomSorted: Record<string, boolean>;
  hiddenWarningNetworks: NetworkName[];
  qr: string | null;
  showPolkaswapAlert: boolean;
  soraCardBannerVisibility: boolean;
};

export const state = (): State => {
  return {
    selectedWallet: accountController.getSelectedWallet(),
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: accountController.getSelectedNetwork(),
    balances: [],
    nfts: {},
    availableNfts: {},
    hiddenAssetsForAllAccounts: accountController.getHiddenAssets(),
    accounts: accountController.getAccounts(),
    isCustomSorted: accountController.getCustomSort(),
    autoSelectNode: accountController.getAutoSelectNodesValue(),
    showPolkaswapAlert: !accountController.getAgreeSwapDisclaimer(),
    hiddenWarningNetworks: accountController.getHiddenWarningNetworks(),
    soraCardBannerVisibility: Date.now() - accountController.getHidingSoraCardBannerTime() >= SORA_CARD_BANNER_RERUN,
    qr: null,
  };
};
