import { SigningRequest } from '@extension-base/background/types';

export type State = {
  requests: SigningRequest[];
};

const state = (): State => {
  return {
    requests: [],
  };
};

export default state;
