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

const MANUAL_LIFECYCLE_ERROR_CODE = 'post_message_provider_manual_lifecycle_unsupported';
const INVALID_CONNECTION_STATE_ERROR_CODE = 'post_message_provider_invalid_connection_state';
const INVALID_PROVIDER_META_ERROR_CODE = 'post_message_provider_invalid_provider_meta';
const PROVIDER_ALREADY_STARTED_ERROR_CODE = 'post_message_provider_already_started';
const MAX_PROVIDER_KEY_LENGTH = 128;
const MAX_PROVIDER_META_FIELD_LENGTH = 256;
const CONTROL_CHARACTERS = /\p{Cc}/u;

type ManualLifecycleOperation = 'connect' | 'disconnect';

class PostMessageProviderError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(`${code}: ${message}`);

    this.code = code;
    this.name = 'PostMessageProviderError';
  }
}

function manualLifecycleError(operation: ManualLifecycleOperation): PostMessageProviderError {
  return new PostMessageProviderError(
    MANUAL_LIFECYCLE_ERROR_CODE,
    `manual ${operation} is unavailable because the extension transport only supports startProvider(key)`
  );
}

function isBoundedTransportText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !CONTROL_CHARACTERS.test(value)
  );
}

function isProviderMeta(value: unknown): value is ProviderMeta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const meta = value as Partial<ProviderMeta>;
  const hasOwn = (key: keyof ProviderMeta): boolean => Object.prototype.hasOwnProperty.call(meta, key);

  return (
    hasOwn('network') &&
    hasOwn('node') &&
    hasOwn('source') &&
    hasOwn('transport') &&
    isBoundedTransportText(meta.network, MAX_PROVIDER_META_FIELD_LENGTH) &&
    (meta.node === 'full' || meta.node === 'light') &&
    isBoundedTransportText(meta.source, MAX_PROVIDER_META_FIELD_LENGTH) &&
    isBoundedTransportText(meta.transport, MAX_PROVIDER_META_FIELD_LENGTH)
  );
}

/**
 * @name PostMessageProvider
 * @description Extension provider to be used by dapps
 */
export default class PostMessageProvider implements InjectedProvider {
  readonly #eventemitter: EventEmitter;
  readonly #sendRequest: SendRequest;
  isClonable = true;
  // Whether or not the actual extension background provider is connected
  #isConnected = false;
  #providerKey: string | undefined;
  #providerMeta: ProviderMeta | undefined;
  #startGeneration = 0;
  #startPromise: Promise<ProviderMeta> | undefined;

  // Subscription IDs are (historically) not guaranteed to be globally unique;
  // only unique for a given subscription method; which is why we identify
  // the subscriptions based on subscription id + type
  readonly #subscriptions: Record<string, AnyFunction> = {}; // {[(type,subscriptionId)]: callback}

  /**
   * @param {function}  sendRequest  The function to be called to send requests to the node
   * @param {function}  subscriptionNotificationHandler  Channel for receiving subscription messages
   */
  public constructor(_sendRequest: SendRequest) {
    this.#eventemitter = new EventEmitter();
    this.#sendRequest = _sendRequest;
  }

  /**
   * @description Returns a clone of the object
   */
  public clone(): PostMessageProvider {
    return new PostMessageProvider(this.#sendRequest);
  }

  /**
   * @description Manual lifecycle is unsupported by the page-to-background transport.
   */
  public connect(): Promise<void> {
    return Promise.reject(manualLifecycleError('connect'));
  }

  /**
   * @description Manual lifecycle is unsupported by the page-to-background transport.
   */
  public disconnect(): Promise<void> {
    return Promise.reject(manualLifecycleError('disconnect'));
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
    return this.#sendRequest('pub(rpc.listProviders)', undefined);
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

  public async send<T = unknown>(
    method: string,
    params: unknown[],
    _?: boolean,
    subscription?: SubscriptionHandler
  ): Promise<T> {
    if (subscription) {
      const { callback, type } = subscription;

      const id = await this.#sendRequest('pub(rpc.subscribe)', { method, params, type }, (res): void => {
        subscription.callback(null, res);
      });

      this.#subscriptions[`${type}::${id}`] = callback;

      return id as T;
    }

    return this.#sendRequest('pub(rpc.send)', { method, params }) as Promise<T>;
  }

  #setConnected(connected: boolean): void {
    if (this.#isConnected === connected) return;

    this.#isConnected = connected;
    this.#eventemitter.emit(connected ? 'connected' : 'disconnected');
  }

  #handleConnectionState(connected: unknown, generation: number): void {
    if (generation !== this.#startGeneration) return;

    if (typeof connected !== 'boolean') {
      const error = new PostMessageProviderError(
        INVALID_CONNECTION_STATE_ERROR_CODE,
        `expected a boolean connection notification, received ${connected === null ? 'null' : typeof connected}`
      );

      this.#eventemitter.emit('error', error);
      this.#setConnected(false);

      return;
    }

    this.#setConnected(connected);
  }

  async #startProvider(key: string, generation: number): Promise<ProviderMeta> {
    const meta = await this.#sendRequest('pub(rpc.startProvider)', key);

    if (!isProviderMeta(meta)) {
      throw new PostMessageProviderError(
        INVALID_PROVIDER_META_ERROR_CODE,
        'the extension returned a malformed provider descriptor'
      );
    }

    const subscribed = await this.#sendRequest('pub(rpc.subscribeConnected)', null, (connected): void => {
      this.#handleConnectionState(connected, generation);
    });

    if (subscribed !== true) {
      throw new PostMessageProviderError(
        INVALID_CONNECTION_STATE_ERROR_CODE,
        'the extension did not acknowledge the connection-state subscription'
      );
    }

    return meta;
  }

  /**
   * @summary Spawn a provider on the extension background.
   */
  public async startProvider(key: string): Promise<ProviderMeta> {
    if (!isBoundedTransportText(key, MAX_PROVIDER_KEY_LENGTH)) {
      throw new PostMessageProviderError(
        INVALID_PROVIDER_META_ERROR_CODE,
        `provider key must be an unpadded, control-free string of 1-${MAX_PROVIDER_KEY_LENGTH} characters`
      );
    }

    if (this.#providerKey) {
      if (this.#providerKey !== key) {
        throw new PostMessageProviderError(
          PROVIDER_ALREADY_STARTED_ERROR_CODE,
          `provider ${this.#providerKey} is already bound to this page channel`
        );
      }

      if (this.#providerMeta) return this.#providerMeta;
      if (this.#startPromise) return this.#startPromise;
    }

    const generation = ++this.#startGeneration;
    const startPromise = this.#startProvider(key, generation);

    this.#providerKey = key;
    this.#startPromise = startPromise;

    try {
      const meta = await startPromise;

      if (generation === this.#startGeneration) this.#providerMeta = meta;

      return meta;
    } catch (error) {
      if (generation === this.#startGeneration) {
        this.#startGeneration += 1;
        this.#setConnected(false);
        this.#providerKey = undefined;
        this.#providerMeta = undefined;
        this.#startPromise = undefined;
      }

      throw error;
    }
  }

  public subscribe(type: string, method: string, params: unknown[], callback: AnyFunction): Promise<number> {
    return this.send(method, params, false, { callback, type }) as Promise<number>;
  }

  /**
   * @summary Allows unsubscribing to subscriptions made with [[subscribe]].
   */
  public async unsubscribe(type: string, method: string, id: number): Promise<boolean> {
    const subscription = `${type}::${id}`;

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
