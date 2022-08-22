import { accountController } from '@/controllers/accountController';
import type { SelectedWallet } from './types';

export type State = {
  selectedWallet: SelectedWallet;
  selectedFiat: string;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    selectedFiat: accountController.getSelectedFiat(),
  };
};

export default state;
