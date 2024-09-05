import { type FWEvmProvider, type SendRequest } from '@extension-base/page/types';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { type JsonRpcRequest, type JsonRpcResponse, type JsonRpcSuccess } from 'json-rpc-engine';
import type { RequestArguments } from '@json-rpc-tools/utils';

export interface SendSyncJsonRpcRequest extends JsonRpcRequest<unknown> {
  method: 'net_version';
}

let subscribeFlag = false;

export class FearlessWalletEvmProvider extends SafeEventEmitter implements FWEvmProvider {
  protected _connected = false;
  public readonly isMetaMask = false;
  private isEnabled = false;

  constructor(protected sendMessage: SendRequest, public readonly version: string) {
    super();

    this._connected = true;
  }

  get connected() {
    return this._connected;
  }

  isConnected() {
    return this._connected;
  }

  protected subscribeExtensionEvents() {
    if (subscribeFlag) return;

    this.sendMessage('evm(events.subscribe)', null, ({ payload, type }) => {
      const messages = [
        'connect',
        'disconnect',
        'accountsChanged',
        'chainChanged',
        'message',
        'data',
        'reconnect',
        'error',
      ];

      if (messages.includes(type)) {
        if (type === 'connect') this._connected = true;
        else if (type === 'disconnect') this._connected = false;

        const finalType = type === 'data' ? 'message' : type;

        this.emit(finalType, payload);
      } else console.warn('Can not handle event', type, payload);
    })
      .then(() => (subscribeFlag = true))
      .catch(() => (subscribeFlag = false));

    subscribeFlag = true;
  }

  enable() {
    return this.request<string[]>({ method: 'eth_requestAccounts' });
  }

  override on(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    this.subscribeExtensionEvents();
    super.on(eventName, listener);

    return this;
  }

  override once(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    this.subscribeExtensionEvents();
    super.once(eventName, listener);

    return this;
  }

  request<T>({ method, params }: RequestArguments): Promise<T> {
    if (!this.isEnabled && method === 'eth_accounts') return this.request({ method: 'eth_requestAccounts' });

    // Subscribe events
    switch (method) {
      // Add origin to params
      case 'wallet_requestPermissions':
        return new Promise((resolve, reject) => {
          const origin = document.title !== '' ? document.title : window.location.hostname;

          this.sendMessage('evm(request)', { params: { ...params, origin }, method })
            .then((result) => resolve(result as T))
            .catch((e) => reject(e));
        });

      // Called once when first connecting to DAPP
      case 'eth_requestAccounts':
        return new Promise((resolve, reject) => {
          const origin = document.title !== '' ? document.title : window.location.hostname;

          this.sendMessage('pub(authorize.tab)', { origin, accountAuthType: 'evm' })
            .then(() => {
              this.isEnabled = true;

              this.request<T>({ method: 'eth_accounts' })
                .then((accounts) => resolve(accounts))
                .catch((e) => reject(e));
            })
            .catch((e) => reject(e));
        });

      default:
        return new Promise((resolve, reject) => {
          this.sendMessage('evm(request)', { params, method })
            .then((result) => resolve(result as T))
            .catch((e) => reject(e));
        });
    }
  }

  private _sendSync(payload: JsonRpcRequest<unknown>): JsonRpcResponse<unknown> {
    let result: JsonRpcSuccess<unknown>['result'];

    switch (payload.method) {
      case 'net_version':
        result = this.version ? `Fearless Wallet v${this.version}` : null;
        break;

      default:
        throw new Error(`Not support ${payload.method}`);
    }

    return {
      id: payload.id,
      jsonrpc: payload.jsonrpc,
      result,
    };
  }

  send<T>(method: string, params?: T[]): Promise<JsonRpcResponse<T>>;
  send<T>(payload: JsonRpcRequest<unknown>, callback: (error: Error | null, result?: JsonRpcResponse<T>) => void): void;
  send<T>(payload: SendSyncJsonRpcRequest): JsonRpcResponse<T>;
  send(methodOrPayload: unknown, callbackOrArgs?: unknown): unknown {
    if (typeof methodOrPayload === 'string' && (!callbackOrArgs || Array.isArray(callbackOrArgs))) {
      return this.request({ method: methodOrPayload, params: callbackOrArgs });
    }

    if (methodOrPayload && typeof methodOrPayload === 'object' && typeof callbackOrArgs === 'function') {
      return this.request(methodOrPayload as JsonRpcRequest<unknown>).then((rs) => {
        (callbackOrArgs as (...args: unknown[]) => void)(rs);
      });
    }

    return this._sendSync(methodOrPayload as SendSyncJsonRpcRequest);
  }

  sendAsync<T>(payload: JsonRpcRequest<T>, callback: (error: Error | null, result?: JsonRpcResponse<T>) => void): void {
    this.request<T>(payload)
      .then((result) => callback(null, { result, id: payload.id, jsonrpc: payload.jsonrpc }))
      .catch((e) => callback(e));
  }
}
