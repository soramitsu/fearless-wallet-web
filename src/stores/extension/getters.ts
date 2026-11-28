import type { EvmRequestPayload, SolanaRequestPayload, TonRequestPayload } from '@extension-base/services/request-service/types';
import type { State } from './state';
import type { AuthUrlInfo } from '@extension-base/background/types/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { SignRequests } from '@/stores/extension/types';

type Getters = {
  signRequestPayload(
    state: State
  ): SignerPayloadJSON | SignerPayloadRaw | EvmRequestPayload | SolanaRequestPayload | TonRequestPayload;
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
    signTonRequests,
  }): SignerPayloadJSON | SignerPayloadRaw | EvmRequestPayload | SolanaRequestPayload | TonRequestPayload {
    if (signRequests.length) return signRequests[0].request.payload;
    if (Object.keys(signEvmRequests).length) return Object.values(signEvmRequests)[0];
    if (Object.keys(signSolanaRequests).length) return Object.values(signSolanaRequests)[0];

    return Object.values(signTonRequests)[0];
  },

  signAllRequests({ signRequests, signEvmRequests, signSolanaRequests, signTonRequests }): SignRequests {
    return { substrate: signRequests, evm: signEvmRequests, solana: signSolanaRequests, ton: signTonRequests };
  },
};
