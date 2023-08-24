import {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
} from '@extension-base/background/types/types';
import type { SessionTypes } from '@walletconnect/types';
import type { Features } from '@/store/extension/types';
import type { SigningRequest } from '@extension-base/background/types';

export type State = {
  requests: {
    auth: AuthorizeRequest[];
    sign: SigningRequest[];
    meta: MetadataRequest[];
    wc: SessionTypes.Struct[];
  };
  authList: Record<string, AuthUrlInfo>;
  tabStatus: ActiveTabAuthorizeStatus | null;
  features: Nullable<Features>;
  onboarding: boolean;
};

const state = (): State => {
  return {
    requests: {
      auth: [],
      meta: [],
      sign: [],
      wc: [],
    },
    authList: {},
    tabStatus: null,
    features: null,
    onboarding: false,
  };
};

export default state;
