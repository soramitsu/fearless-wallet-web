import { type FWEvmProvider } from '@extension-base/page/types';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { type JsonRpcRequest, type JsonRpcResponse, type JsonRpcSuccess } from 'json-rpc-engine';
import { sendMessage } from '.';
import type { RequestArguments } from '@walletconnect/jsonrpc-types';

export interface SendSyncJsonRpcRequest extends JsonRpcRequest<unknown> {
  method: 'net_version';
}

type EvmRequestArguments<T = unknown> = Omit<RequestArguments<T>, 'id'> & {
  id?: unknown;
  jsonrpc?: string;
};

export class FearlessWalletEvmProvider extends SafeEventEmitter implements FWEvmProvider {
  protected _connected = false;
  private subscribed = false;
  private authorization?: Promise<string[]>;
  private authorizationRevision = 0;
  private networkVersion: string | null = null;
  private chainRevision = 0;

  constructor() {
    super();

    this._connected = true;
  }

  get connected() {
    return this._connected;
  }

  override on(eventName: string | symbol, listener: (...args: unknown[]) => void) {
    super.on(eventName, listener);
    this.subscribeExtensionEvents();

    return this;
  }

  override once(eventName: string | symbol, listener: (...args: unknown[]) => void) {
    super.once(eventName, listener);
    this.subscribeExtensionEvents();

    return this;
  }

  override addListener(eventName: string | symbol, listener: (...args: unknown[]) => void) {
    return this.on(eventName, listener);
  }

  isConnected() {
    return this._connected;
  }

  subscribeExtensionEvents() {
    if (this.subscribed) return;
    this.subscribed = true;
    const authorizationRevision = this.authorizationRevision;

    sendMessage('evm(events.subscribe)', null, ({ payload, type }) => {
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
        if (type === 'connect') {
          this._connected = true;
          this.updateChainId((payload as { chainId?: unknown })?.chainId);
        } else if (type === 'disconnect') {
          this._connected = false;
          this.chainRevision++;
          this.networkVersion = null;
        } else if (type === 'chainChanged') this.updateChainId(payload);

        const finalType = type === 'data' ? 'message' : type;

        this.emit(finalType, payload);
      } else console.warn('Can not handle event', type, payload);
    })
      .catch(() => {
        this.subscribed = false;
        // Authorization can finish while an earlier subscription is still
        // checking the old grant. Retry once using the newly approved state.
        if (authorizationRevision !== this.authorizationRevision && this.eventNames().length) {
          this.subscribeExtensionEvents();
        }
      });
  }

  enable() {
    return this.request<string[]>({ method: 'eth_requestAccounts' });
  }

  private updateChainId(chainId: unknown) {
    this.chainRevision++;
    this.networkVersion = typeof chainId === 'string' && /^0x[0-9a-f]+$/i.test(chainId)
      ? BigInt(chainId).toString() : null;
  }

  async request<T>(input: EvmRequestArguments): Promise<T> {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        typeof input.method !== 'string' || !input.method.trim() ||
        (input.params !== undefined && (input.params === null || typeof input.params !== 'object'))) {
      throw Object.assign(new Error('Invalid EVM request arguments'), { code: -32600 });
    }
    const { method, params } = input;
    const chainRevision = this.chainRevision;

    // Subscribe events
    switch (method) {
      // Add origin to params
      case 'wallet_requestPermissions':
        return new Promise((resolve, reject) => {
          const origin = document.title !== '' ? document.title : window.location.hostname;
          const permissionParams = params && typeof params === 'object' ? params : {};

          sendMessage('evm(request)', { params: { ...permissionParams, origin }, method })
            .then((result) => {
              this.authorizationRevision++;
              if (this.eventNames().length) this.subscribeExtensionEvents();
              resolve(result as T);
            })
            .catch((e) => reject(e));
        });

      // Called once when first connecting to DAPP
      case 'eth_requestAccounts':
        if (!this.authorization) {
          const origin = document.title !== '' ? document.title : window.location.hostname;
          this.authorization = sendMessage('evm(authorizeUrl)', { method: '', params: { origin } })
            .then(() => {
              this.authorizationRevision++;
              // Listeners may have been attached before the site was authorized.
              if (this.eventNames().length) this.subscribeExtensionEvents();
              return this.request<string[]>({ method: 'eth_accounts' });
            })
            .finally(() => { this.authorization = undefined; });
        }
        return this.authorization as Promise<T>;

      default:
        return new Promise((resolve, reject) => {
          sendMessage('evm(request)', { params, method })
            .then((result) => {
              if (method === 'eth_chainId' && chainRevision === this.chainRevision) this.updateChainId(result);
              resolve((method === 'eth_accounts' && result === undefined ? [] : result) as T);
            })
            .catch((e) => reject(e));
        });
    }
  }

  sendAsync<T>(payload: JsonRpcRequest<T>, callback: (error: Error | null, result?: JsonRpcResponse<T>) => void): void {
    this.request<T>(payload)
      .then(
        (result) => callback(null, { result, id: payload.id, jsonrpc: payload.jsonrpc }),
        (error) => callback(error)
      );
  }

  private _sendSync(payload: JsonRpcRequest<unknown>): JsonRpcResponse<unknown> {
    let result: JsonRpcSuccess<unknown>['result'];

    switch (payload.method) {
      case 'net_version':
        if (this.networkVersion === null) throw new Error('Network is unknown; use request({ method: "net_version" })');
        result = this.networkVersion;

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

  send<T>(method: string, params?: unknown[]): Promise<T>;
  send<T>(payload: JsonRpcRequest<unknown>, callback: (error: Error | null, result?: JsonRpcResponse<T>) => void): void;
  send<T>(payload: SendSyncJsonRpcRequest): JsonRpcResponse<T>;
  send(methodOrPayload: unknown, callbackOrArgs?: unknown): unknown {
    if (typeof methodOrPayload === 'string' && (!callbackOrArgs || Array.isArray(callbackOrArgs))) {
      return this.request({ method: methodOrPayload, params: callbackOrArgs });
    }

    if (methodOrPayload && typeof methodOrPayload === 'object' && typeof callbackOrArgs === 'function') {
      return this.sendAsync(
        methodOrPayload as JsonRpcRequest<unknown>,
        callbackOrArgs as (error: Error | null, result?: JsonRpcResponse<unknown>) => void
      );
    }

    return this._sendSync(methodOrPayload as SendSyncJsonRpcRequest);
  }
}
