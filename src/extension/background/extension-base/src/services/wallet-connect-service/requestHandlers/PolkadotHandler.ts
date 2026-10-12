import { formatJsonRpcError, formatJsonRpcResult } from '@walletconnect/jsonrpc-utils';
import { getSdkError } from '@walletconnect/utils';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import {
  capturePolkadotSigningContext,
  polkadotSigningPayload,
  validatePolkadotSigningContext,
} from '../polkadotSigningContext';
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
    const payload = polkadotSigningPayload(context.event);
    const signer = 'data' in payload ? new RequestBytesSign(payload) : new RequestExtrinsicSign(payload);
    this.activeRequests.add(owner);
    this.state.requestService
      .sign(
        context.origin,
        signer,
        { address: payload.address, name: '', ethereumAddress: '' },
        `wallet-connect.${crypto.randomUUID()}`,
        context
      )
      .then(async ({ payload: signature }) => {
        // Queue completion and remote response happen in different microtasks.
        validatePolkadotSigningContext(this.state, context);
        await this.walletConnectService.responseRequest({ topic, response: formatJsonRpcResult(id, { signature }) });
      })
      .catch((error) => this.handleError(topic, id, error))
      .finally(() => this.activeRequests.delete(owner));
  }
}
