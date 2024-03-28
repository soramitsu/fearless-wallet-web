import { type PoolsParams } from '@/store/pools/types';

export type State = {
  allPoolsItems: Omit<PoolsParams, 'bondAmount'>[];
};

const state = (): State => {
  return {
    allPoolsItems: [],
  };
};

export default state;
