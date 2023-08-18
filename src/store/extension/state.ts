import {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { Features } from '@/store/extension/types';

export type State = {
  requests: {
    auth: AuthorizeRequest[];
    sign: SigningRequest[];
    meta: MetadataRequest[];
  };
  authList: Record<string, AuthUrlInfo>;
  tabStatus: ActiveTabAuthorizeStatus | null;
  features: Nullable<Features>;
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
    features: null,
  };
};

export default state;
