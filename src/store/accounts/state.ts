import type { SelectedWallet, Accounts } from './types';
import { accountController } from '@/controllers/accountController';

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
