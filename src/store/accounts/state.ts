import { Accounts } from './types';

export type State = {
  accounts: Accounts;
  password: string;
  haveConnectedAccounts: boolean;
};

const state = (): State => {
  return {
    accounts: [],
    password: '',
    haveConnectedAccounts: false,
  };
};

export default state;
