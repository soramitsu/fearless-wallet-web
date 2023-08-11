import {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
  SigningRequest,
  Features,
} from '@/extension/background/extension-base/src/background/types/types';

export type State = {
  requests: {
    auth: AuthorizeRequest[];
    sign: SigningRequest[];
    meta: MetadataRequest[];
  };
  authList: Record<string, AuthUrlInfo>;
  tabStatus: ActiveTabAuthorizeStatus | null;
  features: Features;
};

const state = (): State => {
  return {
    requests: {
      auth: [],
      meta: [],
      sign: [],
    },
    authList: {},
    tabStatus: null,
    features: {
      showSoraCard: true,
    },
  };
};

export default state;
