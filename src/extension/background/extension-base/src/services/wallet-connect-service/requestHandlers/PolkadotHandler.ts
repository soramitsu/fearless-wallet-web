import { formatJsonRpcError, formatJsonRpcResult } from '@json-rpc-tools/utils';
import { type SignClientTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { isSameAddress } from '@extension-base/utils';
import { POLKADOT_SIGNING_METHODS } from '@extension-base/services/wallet-connect-service/types';
import { getWCId, parseRequestParams } from '@extension-base/services/wallet-connect-service/utils';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { WalletConnectService } from '@extension-base/services/wallet-connect-service';

export default class Eip155RequestHandler {
  readonly walletConnectService: WalletConnectService;
  readonly state: State;
  readonly requestService: RequestService;

  constructor(state: State, walletConnectService: WalletConnectService, requestService: RequestService) {
    this.state = state;
    this.walletConnectService = walletConnectService;
    this.requestService = requestService;
  }

  private checkAccount(address: string, accounts: string[]) {
    if (!accounts.find((account) => isSameAddress(account, address))) {
      throw new Error(getSdkError('UNSUPPORTED_ACCOUNTS').message + ' ' + address);
    }
  }

  private handleError(topic: string, id: number, e: unknown) {
    console.info(e);

    let message = (e as Error).message;

    if (message.includes('User Rejected Request')) message = getSdkError('USER_REJECTED').message;

    this.walletConnectService
      .responseRequest({
        topic,
        response: formatJsonRpcError(id, message),
      })
      .catch(console.error);
  }

  public handleRequest(requestEvent: SignClientTypes.EventArguments['session_request']) {
    const { id, params, topic } = requestEvent;
    const { request } = params;
    const method = request.method as POLKADOT_SIGNING_METHODS;
    const requestSession = this.walletConnectService.getSession(topic);
    const url = requestSession.peer.metadata.url;
    const sessionAccounts = requestSession.namespaces.polkadot.accounts.map((account) => account.split(':')[2]);

    if (method === POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE) {
      const param = parseRequestParams<POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE>(request.params);

      this.checkAccount(param.address, sessionAccounts);

      const pair = this.state.keyringService.getPair(param.address)!;
      const address = pair.address;

      this.requestService
        .sign(
          url,
          new RequestBytesSign({ address, data: param.message, type: 'bytes' }, this.state),
          {
            address,
            name: pair.meta.name as string,
            ethereumAddress: pair.meta.ethereumAddress as string,
          },
          getWCId(id)
        )
        .then(async ({ signature }) => {
          await this.walletConnectService.responseRequest({
            topic,
            response: formatJsonRpcResult(id, { signature }),
          });
        })
        .catch((e) => {
          this.handleError(topic, id, e);
        });
    } else if (method === POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION) {
      const param = parseRequestParams<POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION>(request.params);

      this.checkAccount(param.address, sessionAccounts);

      const pair = this.state.keyringService.getPair(param.address)!;
      const address = pair.address;

      this.requestService
        .sign(
          url,
          new RequestExtrinsicSign(param.transactionPayload),
          {
            address,
            name: pair.meta.name as string,
            ethereumAddress: pair.meta.ethereumAddress as string,
          },
          getWCId(id)
        )
        .then(async ({ signature }) => {
          await this.walletConnectService.responseRequest({
            topic,
            response: formatJsonRpcResult(id, { signature }),
          });
        })
        .catch((e) => this.handleError(topic, id, e));
    } else {
      throw Error(`${getSdkError('INVALID_METHOD').message} ${method as string}`);
    }
  }
}
