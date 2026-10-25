import { formatJsonRpcError, formatJsonRpcResult } from '@walletconnect/jsonrpc-utils';
import { getSdkError } from '@walletconnect/utils';
import { capturePolkadotSigningContext } from '../polkadotSigningContext';
import type { SignClientTypes } from '@walletconnect/types';
import type State from '@extension-base/background/handlers/State';
import type { WalletConnectService } from '@extension-base/services/wallet-connect-service';

export class PolkadotHandler {
  private readonly activeRequests = new Set<string>();
  constructor(
    public state: State,
    public walletConnectService: WalletConnectService
  ) {}

  private handleError(topic: string, id: number, error: unknown) {
    let message = error instanceof Error ? error.message : 'Unable to sign WalletConnect request';
    if (message.includes('User Rejected Request')) message = getSdkError('USER_REJECTED').message;
    this.walletConnectService
      .responseRequest({ topic, response: formatJsonRpcError(id, message) })
      .catch(console.error);
  }

  public handleRequest(requestEvent: SignClientTypes.EventArguments['session_request']) {
    const context = capturePolkadotSigningContext(this.state, requestEvent);
    const { topic, id } = context.event;
    const owner = JSON.stringify([topic, id]);
    if (this.activeRequests.has(owner)) {
      this.handleError(topic, id, new Error('Duplicate active WalletConnect request'));
      return;
    }
    this.activeRequests.add(owner);
    const pending = this.state.requestService.signWalletConnect(context);
    pending.result
      .then(async ({ payload: signature }) => {
        // Queue completion and remote response happen in different microtasks.
        pending.validate();
        await this.walletConnectService.responseRequest({ topic, response: formatJsonRpcResult(id, { signature }) });
      })
      .catch((error) => this.handleError(topic, id, error))
      .finally(() => this.activeRequests.delete(owner));
  }
}
