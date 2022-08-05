import type { SelectedWallet } from './types';

export type State = {
  selectedWallet: SelectedWallet;
};

const state = (): State => {
  return {
    selectedWallet: { address: '', ethereumAddress: '', name: '' },
  };
};

export default state;
