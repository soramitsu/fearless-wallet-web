import type { AvailableNftState, ChainNftState } from '@extension-base/services/nft-service/types';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { NetworkScanState } from '@extension-base/api/evm/types';
import type { SelectedWallet, SelectedNetworks, AutoSelectNode, HiddenAssets, AssetPreferences } from './types';
import type { NetworkName } from '@/interfaces';
import { accountController } from '@/controllers';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  accounts: AccountJson[];
  balances: TokenGroup[];
  networkScanStates: Record<NetworkName, NetworkScanState>;
  nfts: ChainNftState;
  availableNfts: AvailableNftState;
  hiddenAssetsForAllAccounts: HiddenAssets;
  assetPreferencesForAllAccounts: AssetPreferences;
  autoSelectNode: AutoSelectNode;
  isCustomSorted: Record<string, boolean>;
  hiddenWarningNetworks: NetworkName[];
  qr: string | null;
  showPolkaswapAlert: boolean;
  isBalanceLoading: boolean;
};

export const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' } as SelectedWallet,
    selectedFiat: 'usd',
    selectedNetworks: {},
    balances: [],
    networkScanStates: {},
    nfts: {},
    availableNfts: {},
    hiddenAssetsForAllAccounts: accountController.getHiddenAssets(),
    assetPreferencesForAllAccounts: accountController.getAssetPreferences(),
    accounts: [],
    isCustomSorted: accountController.getCustomSort(),
    autoSelectNode: accountController.getAutoSelectNodesValue(),
    showPolkaswapAlert: !accountController.getAgreeSwapDisclaimer(),
    hiddenWarningNetworks: accountController.getHiddenWarningNetworks(),
    qr: null,
    isBalanceLoading: false,
  };
};
