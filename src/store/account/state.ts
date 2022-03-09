import { Account } from './types';

export type State = {
  account: Account;
  nickname: string;
};

const state = (): State => {
  return {
    account: {},
    nickname: '',
  };
};

export default state;
