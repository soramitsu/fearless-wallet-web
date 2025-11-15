import EventEmitter from 'eventemitter3';
import { isUndefined, logger } from '@polkadot/util';
import type { InjectedProvider, ProviderList, ProviderMeta } from '@polkadot/extension-inject/types';
import type { ProviderInterfaceEmitCb, ProviderInterfaceEmitted } from '@polkadot/rpc-provider/types';
import type { AnyFunction } from '@polkadot/types/types';
import type { SendRequest } from '@extension-base/page/types';

const l = logger('PostMessageProvider');

type CallbackHandler = (error?: null | Error, value?: unknown) => void;

interface SubscriptionHandler {
  callback: CallbackHandler;
  type: string;
}

// External to class, this.# is not private enough (yet)
let sendRequest: SendRequest;

/**
 * @name PostMessageProvider
 * @description Extension provider to be used by dapps
 */
export default class PostMessageProvider implements InjectedProvider {
  readonly #eventemitter: EventEmitter;
  isClonable = true;
  // Whether or not the actual extension background provider is connected
  #isConnected = false;
  #hasConnectedSubscription = false;

  // Subscription IDs are (historically) not guaranteed to be globally unique;
  // only unique for a given subscription method; which is why we identify
  // the subscriptions based on subscription id + type
  readonly #subscriptions: Record<string, AnyFunction> = {}; // {[(type,subscriptionId)]: callback}
  readonly #buildRpcPayload = (method: unknown, params?: unknown[]): { method: string; params: unknown[] } => {
    if (typeof method !== 'string' || method.trim() === '') {
      throw new Error('Invalid RPC method');
    }

    if (params === undefined) {
      return { method: method.trim(), params: [] };
    }

    if (!Array.isArray(params)) {
      throw new Error('Invalid RPC params');
    }

    return { method: method.trim(), params };
  };

  /**
   * @param {function}  sendRequest  The function to be called to send requests to the node
   * @param {function}  subscriptionNotificationHandler  Channel for receiving subscription messages
   */
  public constructor(_sendRequest: SendRequest) {
    this.#eventemitter = new EventEmitter();

    sendRequest = _sendRequest;
  }

  /**
   * @description Returns a clone of the object
   */
  public clone(): InjectedProvider {
    return new PostMessageProvider(sendRequest);
  }

  /**
   * @description Manually disconnect from the connection, clearing autoconnect logic
   */
  public async connect(): Promise<void> {
    const result = await sendRequest('pub(rpc.connect)', undefined);

    if (!result) throw new Error('Unable to connect provider');
  }

  /**
   * @description Manually disconnect from the connection, clearing autoconnect logic
   */
  public async disconnect(): Promise<void> {
    const result = await sendRequest('pub(rpc.disconnect)', undefined);

    if (!result) throw new Error('Unable to disconnect provider');

    if (this.#isConnected) {
      this.#isConnected = false;
      this.#eventemitter.emit('disconnected');
    }
  }

  /**
   * @summary `true` when this provider supports subscriptions
   */
  public get hasSubscriptions(): boolean {
    // FIXME This should see if the extension's state's provider has subscriptions
    return true;
  }

  /**
   * @summary Whether the node is connected or not.
   * @return {boolean} true if connected
   */
  public get isConnected(): boolean {
    return this.#isConnected;
  }

  public listProviders(): Promise<ProviderList> {
    return sendRequest('pub(rpc.listProviders)', undefined);
  }

  /**
   * @summary Listens on events after having subscribed using the [[subscribe]] function.
   * @param  {ProviderInterfaceEmitted} type Event
   * @param  {ProviderInterfaceEmitCb}  sub  Callback
   * @return unsubscribe function
   */
  public on(type: ProviderInterfaceEmitted, sub: ProviderInterfaceEmitCb): () => void {
    this.#eventemitter.on(type, sub);

    return (): void => {
      this.#eventemitter.removeListener(type, sub);
    };
  }

  public async send<T = unknown>(method: string, params: unknown[], isCacheable?: boolean): Promise<T>;
  public async send<T = unknown>(
    method: string,
    params: unknown[],
    isCacheable: boolean | undefined,
    subscription: SubscriptionHandler
  ): Promise<T>;
  public async send<T = unknown>(
    method: string,
    params: unknown[],
    _?: boolean,
    subscription?: SubscriptionHandler
  ): Promise<T> {
    if (subscription && typeof subscription.callback !== 'function') {
      throw new Error('Invalid subscription callback');
    }

    const payload = this.#buildRpcPayload(method, params);

    if (subscription) {
      const { callback, type } = subscription;
      const subscriptionType = typeof type === 'string' ? type.trim() : '';

      if (subscriptionType.length === 0) {
        throw new Error('Invalid subscription type');
      }

      const id = await sendRequest('pub(rpc.subscribe)', { ...payload, type: subscriptionType }, (res): void => {
        subscription.callback(null, res);
      });

      this.#subscriptions[`${subscriptionType}::${id}`] = callback;

      return id as T;
    }

    return sendRequest('pub(rpc.send)', payload) as Promise<T>;
  }

  /**
   * @summary Spawn a provider on the extension background.
   */
  public async startProvider(key: string): Promise<ProviderMeta> {
    // Disconnect from the previous provider
    this.#isConnected = false;
    this.#eventemitter.emit('disconnected');

    const meta = await sendRequest('pub(rpc.startProvider)', key);

    if (!this.#hasConnectedSubscription) {
      this.#hasConnectedSubscription = true;

      void sendRequest('pub(rpc.subscribeConnected)', null, (connected) => {
        if (this.#isConnected === connected) return true;

        this.#isConnected = connected;

        this.#eventemitter.emit(connected ? 'connected' : 'disconnected');

        return true;
      });
    }

    return meta;
  }

  public subscribe(type: string, method: string, params: unknown[], callback: AnyFunction): Promise<number> {
    return this.send(method, params, false, { callback, type }) as Promise<number>;
  }

  /**
   * @summary Allows unsubscribing to subscriptions made with [[subscribe]].
   */
  public async unsubscribe(type: string, method: string, id: number): Promise<boolean> {
    const subscriptionType = typeof type === 'string' ? type.trim() : '';

    if (!subscriptionType) {
      l.debug((): string => `Unable to process unsubscribe for invalid subscription type=${type}`);

      return false;
    }

    const subscription = `${subscriptionType}::${id}`;

    // FIXME This now could happen with re-subscriptions. The issue is that with a re-sub
    // the assigned id now does not match what the API user originally received. It has
    // a slight complication in solving - since we cannot rely on the send id, but rather
    // need to find the actual subscription id to map it
    if (isUndefined(this.#subscriptions[subscription])) {
      l.debug((): string => `Unable to find active subscription=${subscription}`);

      return false;
    }

    delete this.#subscriptions[subscription];

    return this.send(method, [id]) as Promise<boolean>;
  }
}
