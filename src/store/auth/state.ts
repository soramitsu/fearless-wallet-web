import { AuthUrlInfo } from '@polkadot/extension-base/background/handlers/State';
import { AuthorizeRequest } from '@polkadot/extension-base/background/types';

export type State = {
  requests: AuthorizeRequest[];
  authList: Record<string, AuthUrlInfo>;
};

const state = (): State => {
  return {
    requests: [],
    authList: {},
  };
};

export default state;
