import EventEmitter from 'eventemitter3';
import { eip6963ProviderInfo } from '@extension-base/const';
import { sendMessage } from '.';
import type {
  FWIrohaProvider,
  IrohaAccountInfo,
  IrohaConnectInput,
  IrohaConnectResponse,
  IrohaNetworkKey,
} from '@extension-base/page/types';

type IrohaEventName = 'connect' | 'disconnect' | 'accountChanged' | 'change';

const getOrigin = (): string => {
  if (document.title) return document.title;

  return window.location.hostname;
};

const normalizeNetwork = (network: unknown): IrohaNetworkKey => (network === 'taira' ? 'taira' : 'nexus');

const sameAccounts = (a: readonly IrohaAccountInfo[], b: readonly IrohaAccountInfo[]): boolean =>
  JSON.stringify(a.map(({ address, network }) => `${network}:${address}`)) ===
  JSON.stringify(b.map(({ address, network }) => `${network}:${address}`));

export class FearlessWalletIrohaProvider extends EventEmitter<IrohaEventName> implements FWIrohaProvider {
  readonly isFearlessWallet = true;
  readonly version = '1.0.0' as const;
  readonly name = eip6963ProviderInfo.name;

  #accounts: readonly IrohaAccountInfo[] = Object.freeze([]);
  #network: IrohaNetworkKey = 'nexus';

  constructor() {
    super();

    this.refreshAccounts().catch(() => undefined);
    sendMessage('iroha(events.subscribe)', { network: this.#network, origin: getOrigin(), silent: true }, ({ accounts }) => {
      this.applyAccounts(accounts);
    }).catch(() => undefined);
  }

  get accounts(): readonly IrohaAccountInfo[] {
    return this.#accounts;
  }

  get connected(): boolean {
    return this.#accounts.length > 0;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get publicKeyHex(): string | null {
    return this.#accounts[0]?.publicKeyHex ?? null;
  }

  get selectedAddress(): string | null {
    return this.#accounts[0]?.address ?? null;
  }

  async connect(input: IrohaConnectInput = {}): Promise<IrohaConnectResponse> {
    const network = normalizeNetwork(input.network);
    const silent = input.onlyIfTrusted ?? input.silent ?? false;

    this.#network = network;

    const response = silent
      ? await this.refreshAccounts()
      : await sendMessage('iroha(authorizeUrl)', { network, origin: getOrigin(), silent: false });

    return this.applyAccounts(response.accounts);
  }

  async disconnect(): Promise<void> {
    await sendMessage('iroha(disconnect)');
    this.applyAccounts([]);
  }

  async request<T = unknown>({ method, params }: { method: string; params?: unknown }): Promise<T> {
    switch (method) {
      case 'accounts':
        return this.refreshAccounts() as Promise<T>;
      case 'connect':
        return this.connect(params as IrohaConnectInput) as Promise<T>;
      case 'disconnect':
        await this.disconnect();

        return undefined as T;
      case 'signAndSendTransaction':
      case 'signTransaction':
        throw new Error('Iroha transaction signing is not available in this browser build yet');
      default:
        throw new Error(`Unsupported Iroha request method: ${method}`);
    }
  }

  private async refreshAccounts(): Promise<IrohaConnectResponse> {
    return sendMessage('iroha(accounts)', { network: this.#network, origin: getOrigin(), silent: true });
  }

  private applyAccounts(accounts: IrohaAccountInfo[]): IrohaConnectResponse {
    const previousAccounts = this.#accounts;
    const nextAccounts = Object.freeze(accounts);

    this.#accounts = nextAccounts;

    if (!sameAccounts(previousAccounts, nextAccounts)) {
      this.emit('change', { accounts: nextAccounts });
      this.emit('accountChanged', nextAccounts[0] ?? null);

      if (previousAccounts.length === 0 && nextAccounts.length > 0) this.emit('connect', nextAccounts[0]);
      if (previousAccounts.length > 0 && nextAccounts.length === 0) this.emit('disconnect');
    }

    return { accounts };
  }
}
