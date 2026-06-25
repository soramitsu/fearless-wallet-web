import type { EvmRequestPayload, SolanaRequestPayload } from '@extension-base/services/request-service/types';
import type { State } from './state';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { SignRequests } from '@/stores/extension/types';

type Getters = {
  signRequestPayload(state: State): SignerPayloadJSON | SignerPayloadRaw | EvmRequestPayload | SolanaRequestPayload;
  signAllRequests(state: State): SignRequests;
  getAuthItem(state: State): (value: string) => AuthUrlInfo | undefined;
};

export const getters: Getters = {
  getAuthItem:
    ({ authList }) =>
    (value: string) => {
      return authList[value];
    },

  signRequestPayload({
    signRequests,
    signEvmRequests,
    signSolanaRequests,
  }): SignerPayloadJSON | SignerPayloadRaw | EvmRequestPayload | SolanaRequestPayload {
    if (signRequests.length) return signRequests[0].request.payload;
    if (Object.keys(signEvmRequests).length) return Object.values(signEvmRequests)[0];

    return Object.values(signSolanaRequests)[0];
  },

  signAllRequests({ signRequests, signEvmRequests, signSolanaRequests }): SignRequests {
    return { substrate: signRequests, evm: signEvmRequests, solana: signSolanaRequests };
  },
};
