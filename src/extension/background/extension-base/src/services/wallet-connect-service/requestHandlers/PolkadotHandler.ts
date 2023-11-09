import { formatJsonRpcError, formatJsonRpcResult } from '@json-rpc-tools/utils';
import { SignClientTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { isSameAddress } from '@extension-base/utils';
import State from '@extension-base/background/handlers/State';
import { keyring } from '@polkadot/ui-keyring';
import { WalletConnectService } from '..';
import { getWCId, parseRequestParams } from '../utils';
import { RequestService } from '../../request-service';
import RequestBytesSign from '../../../signers/RequestBytesSign';
import RequestExtrinsicSign from '../../../signers/RequestExtrinsicSign';
import { POLKADOT_SIGNING_METHODS } from '../types';

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
    const { id, params, topic } = requestEvent;
    const { request } = params;
    const method = request.method as POLKADOT_SIGNING_METHODS;
    const requestSession = this.walletConnectService.getSession(topic);
    const url = requestSession.peer.metadata.url;
    const sessionAccounts = requestSession.namespaces.polkadot.accounts.map((account) => account.split(':')[2]);

    if (method === POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE) {
      const param = parseRequestParams<POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE>(request.params);

      this.checkAccount(param.address, sessionAccounts);

      const pair = keyring.getPair(param.address);
      const address = pair.address;

      this.requestService
        .sign(
          url,
          new RequestBytesSign({ address, data: param.message, type: 'bytes' }),
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

      const pair = keyring.getPair(param.address);
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
        .catch((e) => {
          this.handleError(topic, id, e);
        });
    } else {
      throw Error(`${getSdkError('INVALID_METHOD').message} ${method as string}`);
    }
  }
}
