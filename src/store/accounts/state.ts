import type { SelectedWallet, Accounts } from './types';
import { accountController } from '@/controllers/accountController';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  accounts: Accounts;
  addresses: Accounts;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
    accounts: {},
    addresses: {},
  };
};

export default state;
