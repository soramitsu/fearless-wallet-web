import type { SelectedWallet, Accounts, SelectedNetworks } from './types';
import { accountController } from '@/controllers/accountController';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  selectedNetworks: SelectedNetworks;
  accounts: Accounts;
  addresses: Accounts;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
    selectedNetworks: {},
    accounts: {},
    addresses: {},
  };
};

export default state;
