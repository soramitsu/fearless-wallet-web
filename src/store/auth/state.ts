import { AuthorizeRequest, AuthUrlInfo } from '@extension-base/background/types';

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
