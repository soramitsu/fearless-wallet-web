import { Networks } from './types';

export type State = {
  networks: Networks;
};

const state = (): State => {
  return {
    networks: [],
  };
};

export default state;
