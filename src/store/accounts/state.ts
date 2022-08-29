import { accountController } from '@/controllers/accountController';
import type { SelectedWallet, Accounts } from './types';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
  accounts: Accounts;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
    accounts: {},
  };
};

export default state;
