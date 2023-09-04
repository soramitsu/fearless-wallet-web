import { ResponseSigning } from '../../background/types';
import { Resolver } from '../../types';
import { WalletConnectTransactionRequest } from '../wallet-connect-service/types';

export type BrowserConfirmationType = 'extension' | 'popup' | 'window';

export type WCSignRequest = Resolver<ResponseSigning> & {
  request: WalletConnectTransactionRequest;
};
