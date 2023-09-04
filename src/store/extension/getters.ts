import type { State } from './state';
import type {
  WalletConnectSessionRequest,
  WalletConnectSessions,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type {
  ActiveTabAuthorizeStatus,
  AuthorizeRequest,
  AuthUrlInfo,
  MetadataRequest,
} from '@/extension/background/extension-base/src/background/types';
import type { SigningRequest } from '@extension-base/background/types/types';
import type { GetterTree } from 'vuex';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { Features } from '@/store/extension/types';

export enum GettersTypes {
  authRequests = 'authRequests',
  authList = 'authList',
  getAuthItem = 'getAuthItem',
  metaRequests = 'metaRequests',
  signRequestPayload = 'signRequestPayload',
  signList = 'signList',
  tabStatus = 'tabStatus',
  features = 'features',
  onboarding = 'onboarding',
  wcConnectRequests = 'wcConnectRequests',
  wcSessions = 'wcSessions',
  wcSignList = 'wcSignList',
}

export type Getters = {
  [GettersTypes.authRequests](state: State, getters?: GetterTree<State, State> & Getters): AuthorizeRequest[];
  [GettersTypes.authList](state: State, getters?: GetterTree<State, State> & Getters): Record<string, AuthUrlInfo>;
  [GettersTypes.getAuthItem](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): (value: string) => AuthUrlInfo | undefined;
  [GettersTypes.tabStatus](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): Nullable<ActiveTabAuthorizeStatus>;
  [GettersTypes.features](state: State, getters?: GetterTree<State, State> & Getters): Nullable<Features>;
  [GettersTypes.metaRequests](state: State, getters?: GetterTree<State, State> & Getters): MetadataRequest[];
  [GettersTypes.signRequestPayload](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): SignerPayloadJSON | SignerPayloadRaw;
  [GettersTypes.signList](state: State, getters?: GetterTree<State, State> & Getters): SigningRequest[];
  [GettersTypes.onboarding](state: State, getters?: GetterTree<State, State> & Getters): boolean;
  [GettersTypes.wcConnectRequests](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): WalletConnectSessionRequest[];
  [GettersTypes.wcSessions](state: State, getters?: GetterTree<State, State> & Getters): WalletConnectSessions;
  [GettersTypes.wcSignList](
    state: State,
    getters?: GetterTree<State, State> & Getters
  ): WalletConnectTransactionRequest[];
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.authRequests]({ authRequests }): AuthorizeRequest[] {
    return authRequests;
  },

  [GettersTypes.authList]({ authList }): Record<string, AuthUrlInfo> {
    return authList;
  },

  [GettersTypes.getAuthItem]:
    ({ authList }) =>
    (value: string) => {
      return authList[value];
    },
  [GettersTypes.metaRequests]({ metaRequests }): MetadataRequest[] {
    return metaRequests;
  },

  [GettersTypes.signRequestPayload]({ signRequests }): SignerPayloadJSON | SignerPayloadRaw {
    const [
      {
        request: { payload },
      },
    ] = signRequests;

    return payload;
  },

  [GettersTypes.signList]({ signRequests }): SigningRequest[] {
    return signRequests;
  },

  [GettersTypes.tabStatus]({ tabStatus }): ActiveTabAuthorizeStatus | null {
    return tabStatus;
  },

  [GettersTypes.features]({ features }): Nullable<Features> {
    return features;
  },
  [GettersTypes.onboarding]({ onboarding }): boolean {
    return onboarding;
  },
  [GettersTypes.wcConnectRequests]({ wcConnectRequests }): WalletConnectSessionRequest[] {
    return wcConnectRequests;
  },
  [GettersTypes.wcSessions]({ wcSessions }): WalletConnectSessions {
    return wcSessions;
  },
  [GettersTypes.wcSignList]({ wcRequests }): WalletConnectTransactionRequest[] {
    return wcRequests;
  },
};

export default getters;
