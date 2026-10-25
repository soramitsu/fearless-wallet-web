import { formatJsonRpcError, formatJsonRpcResult } from '@walletconnect/jsonrpc-utils';
import { getSdkError } from '@walletconnect/utils';
import { captureWalletConnectSigningContext } from '../signingContext';
import type { SignClientTypes } from '@walletconnect/types';
import type { WalletConnectService } from '@extension-base/services/wallet-connect-service';
import type State from '@extension-base/background/handlers/State';

export class Eip155RequestHandler {
  constructor(
    public state: State,
    public walletConnectService: WalletConnectService
  ) {}

  private handleError(topic: string, id: number, e: unknown) {
    let message = (e as Error).message;

    if (message.includes('User Rejected Request')) {
      message = getSdkError('USER_REJECTED').message;
    }

    this.walletConnectService
      .responseRequest({
        topic,
        response: formatJsonRpcError(id, message),
      })
      .catch(console.error);
  }

  public handleRequest(requestEvent: SignClientTypes.EventArguments['session_request']) {
    const snapshot = structuredClone(requestEvent);
    const context = captureWalletConnectSigningContext(this.state, snapshot);
    const { topic, id } = snapshot;
    const createRequest = () => {
      const current = captureWalletConnectSigningContext(this.state, snapshot);
      if (JSON.stringify(current) !== JSON.stringify(context))
        throw new Error('WalletConnect context changed before review');
      return this.state.requestService.evmRequestHandler
        .onWCSign(snapshot, context)
        .then(({ payload }) => {
          const current = captureWalletConnectSigningContext(this.state, snapshot);
          if (JSON.stringify(current) !== JSON.stringify(context))
            throw new Error('WalletConnect context changed before response');
          return this.walletConnectService.responseRequest({ topic, response: formatJsonRpcResult(id, payload) });
        })
        .catch((error) => this.handleError(topic, id, error));
    };
    const network = this.state.networkService.networkMap[context.network.name];
    if (snapshot.params.request.method === 'eth_sendTransaction' && !network.active) {
      this.state
        .setActiveNetworks(context.network.name)
        .then(createRequest)
        .catch((error) => this.handleError(topic, id, error));
    } else {
      void createRequest();
    }
  }
}
