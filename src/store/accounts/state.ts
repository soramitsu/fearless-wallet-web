import { Accounts } from './types';

export type State = {
  accounts: Accounts;
  nickname: string;
  password: string;
};

const state = (): State => {
  return {
    accounts: [],
    nickname: '',
    password: '',
  };
};

export default state;
