import { State } from './types';

const state = (): State => {
  return {
    requests: [],
    savePass: false,
  };
};

export default state;
