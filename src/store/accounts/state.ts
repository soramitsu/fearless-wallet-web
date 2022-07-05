import type { SelectedWallet } from './types';

export type State = {
  password: string;
  selectedWallet: SelectedWallet;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
    password: '',
  };
};

export default state;
