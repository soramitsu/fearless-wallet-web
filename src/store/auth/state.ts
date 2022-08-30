import { State } from './types';

const state = (): State => {
  return {
    requests: [],
    authList: {},
  };
};

export default state;
