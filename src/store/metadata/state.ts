import { MetadataRequest } from '@extension-base/background/types';

export type State = {
  requests: MetadataRequest[];
};

const state = (): State => {
  return {
    requests: [],
  };
};

export default state;
