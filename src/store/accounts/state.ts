import { SelectedWallet } from './types';

export type State = {
  password: string;
  selectedWallet: SelectedWallet;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '', type: '' },
    password: '',
  };
};

export default state;
