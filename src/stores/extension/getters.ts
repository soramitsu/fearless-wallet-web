import type { EvmRequestPayload } from '@extension-base/services/request-service/types';
import type { State } from './state';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { SignRequests } from '@/stores/extension/types';

type Getters = {
  signRequestPayload(state: State): SignerPayloadJSON | SignerPayloadRaw | EvmRequestPayload;
  signAllRequests(state: State): SignRequests;
  getAuthItem(state: State): (value: string) => AuthUrlInfo | undefined;
};

export const getters: Getters = {
  getAuthItem:
    ({ authList }) =>
    (value: string) => {
      return authList[value];
    },

  signRequestPayload({ signRequests, signEvmRequests }): SignerPayloadJSON | SignerPayloadRaw | EvmRequestPayload {
    if (signRequests.length) return signRequests[0].request.payload;

    return Object.values(signEvmRequests)[0];
  },

  signAllRequests({ signRequests, signEvmRequests }): SignRequests {
    return { substrate: signRequests, evm: signEvmRequests };
  },
};
