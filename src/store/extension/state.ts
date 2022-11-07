import {
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
  MetaRequest,
  SigningRequest,
} from '@extension-base/background/types';

export type State = {
  requests: {
    auth: AuthorizeRequest[];
    sign: SigningRequest[];
    meta: MetadataRequest[];
  };
  authList: Record<string, AuthUrlInfo>;
};

const state = (): State => {
  return {
    requests: {
      auth: [],
      meta: [],
      sign: [],
    },
    authList: {},
  };
};

export default state;
