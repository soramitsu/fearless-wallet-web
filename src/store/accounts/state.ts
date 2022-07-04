import type { SelectedWallet } from './types';
import AccountController from '@/controllers/accountController';

export type State = {
  password: string;
  selectedWallet: SelectedWallet;
  accountController: AccountController;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    password: '',
    accountController: new AccountController(),
  };
};

export default state;
