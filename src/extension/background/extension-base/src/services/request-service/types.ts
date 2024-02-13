import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { AccountAuthType, Resolver, ResponseSigning } from '@extension-base/background/types/types';

export type BrowserConfirmationType = 'extension' | 'popup' | 'window';

export type WCSignRequest = Resolver<ResponseSigning> & {
  request: WalletConnectTransactionRequest;
};

export type DAppChainInfoPayload = {
  accessType: AccountAuthType;
  autoActive?: boolean;
  defaultChain?: string;
  url?: string;
};
