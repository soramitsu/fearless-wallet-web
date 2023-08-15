import {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
} from '@extension-base/background/types/types';
import type { Features } from '@/store/extension/types';
import { SigningRequest } from '@/extension/background/extension-base/src/background/types';

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
      soraCard: true,
    },
  };
};

export default state;
