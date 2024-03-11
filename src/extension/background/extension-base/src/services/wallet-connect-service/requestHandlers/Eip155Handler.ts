import { formatJsonRpcError, formatJsonRpcResult } from '@json-rpc-tools/utils';
import { getSdkError } from '@walletconnect/utils';
import { isSameAddress } from '@extension-base/utils';
import { getEip155MessageAddress, parseRequestParams } from '@extension-base/services/wallet-connect-service/utils';
import { EIP155_SIGNING_METHODS } from '@extension-base/services/wallet-connect-service/types';
import type { SignClientTypes } from '@walletconnect/types';
import type { WalletConnectService } from '@extension-base/services/wallet-connect-service';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';

export default class Eip155RequestHandler {
  private readonly walletConnectService: WalletConnectService;
  private readonly state: State;
  private readonly requestService: RequestService;

  constructor(state: State, walletConnectService: WalletConnectService, requestService: RequestService) {
    this.state = state;
    this.walletConnectService = walletConnectService;
    this.requestService = requestService;
  }

  checkAccount(address: string, accounts: string[]) {
    if (!accounts.find((account) => isSameAddress(account, address))) {
      throw new Error(getSdkError('UNSUPPORTED_ACCOUNTS').message + ' ' + address);
    }
  }

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
    const { id, params, topic } = requestEvent;
    const { chainId: _chainId, request } = params;
    const method = request.method as EIP155_SIGNING_METHODS;
    const requestSession = this.walletConnectService.getSession(topic);

    const sessionAccounts = requestSession.namespaces.eip155.accounts.map((account) => account.split(':')[2]);

    if (
      [
        EIP155_SIGNING_METHODS.PERSONAL_SIGN,
        EIP155_SIGNING_METHODS.ETH_SIGN,
        EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA,
        EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3,
        EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4,
      ].includes(method)
    ) {
      const address = getEip155MessageAddress(method, request.params);

      this.checkAccount(address, sessionAccounts);

      this.requestService.evmRequestHandler
        .onWCSign(requestEvent)
        .then(async ({ payload }) => {
          const response = formatJsonRpcResult(id, payload);
          this.walletConnectService.responseRequest({ topic, response });
        })
        .catch((e: any) => this.handleError(topic, id, e));
    } else if (method === EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION) {
      const [tx] = parseRequestParams<EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION>(request.params);

      const address = tx.from;

      this.checkAccount(address, sessionAccounts);

      const chainId = _chainId.split(':')[1];

      const [networkKey, chainInfo] = this.state.networkService.findNetworkKeyByChainId(chainId);

      if (!networkKey || !chainInfo) {
        throw new Error(getSdkError('UNSUPPORTED_CHAINS').message + ' ' + address);
      }

      const chainState = this.state.networkMap[networkKey];

      const createRequest = () => {
        this.requestService.evmRequestHandler
          .onWCSign(requestEvent)
          .then(async ({ payload }) => {
            await this.walletConnectService.responseRequest({
              topic,
              response: formatJsonRpcResult(id, payload),
            });
          })
          .catch((e) => {
            this.handleError(topic, id, e);
          });
      };

      if (!chainState.active) {
        this.state
          .setActiveNetworks(networkKey)
          .then(createRequest)
          .catch(() => {
            throw new Error(getSdkError('USER_REJECTED').message + ' Can not active chain: ' + chainInfo.name);
          });
      } else {
        createRequest();
      }
    } else {
      throw Error(getSdkError('INVALID_METHOD').message + ' ' + method);
    }
  }
}
