import EventEmitter from 'eventemitter3';
import { base58Decode } from '@polkadot/util-crypto';
import { eip6963ProviderInfo } from '@extension-base/const';
import { sendMessage } from '.';
import type {
  FWSolanaProvider,
  SolanaAccountInfo,
  SolanaChainId,
  SolanaConnectInput,
  SolanaConnectResponse,
  SolanaPublicKeyLike,
  SolanaSignAllTransactionsRequest,
  SolanaSignAndSendTransactionOptions,
  SolanaSignAndSendTransactionRequest,
  SolanaSignMessageRequest,
  SolanaWalletStandardAccount,
  SolanaWalletStandardSignAndSendTransactionInput,
  SolanaWalletStandardSignAndSendTransactionOutput,
  SolanaWalletStandardSignMessageInput,
  SolanaWalletStandardSignMessageOutput,
  SolanaWalletStandardSignTransactionInput,
  SolanaWalletStandardSignTransactionOutput,
} from '@extension-base/page/types';

const SOLANA_MAINNET_CHAIN: SolanaChainId = 'solana:mainnet';
const SOLANA_ACCOUNT_FEATURES = Object.freeze([
  'solana:signMessage',
  'solana:signTransaction',
  'solana:signAndSendTransaction',
] as const);
const SOLANA_SUPPORTED_TRANSACTION_VERSIONS = Object.freeze(['legacy', 0] as const);

type SolanaEventName = 'connect' | 'disconnect' | 'accountChanged' | 'change';
type WalletStandardRegisterApi = {
  register(wallet: FWSolanaProvider): void;
};
type SerializedTransactionInput<T> = {
  restore: (bytes: Uint8Array) => T | Uint8Array;
  transactionBase64: string;
};
type SolanaSignAndSendTransactionInput = {
  options?: SolanaSignAndSendTransactionOptions;
  transaction: unknown;
};
type SolanaTransactionLike = {
  constructor?: {
    deserialize?: (bytes: Uint8Array) => unknown;
    from?: (bytes: Uint8Array) => unknown;
  };
  serialize(options?: { requireAllSignatures?: boolean; verifySignatures?: boolean }): ArrayLike<number>;
};

class SolanaPublicKey implements SolanaPublicKeyLike {
  readonly #bytes: Uint8Array;

  constructor(readonly address: string) {
    this.#bytes = base58Decode(address);
  }

  equals(other: SolanaPublicKeyLike): boolean {
    return this.toBase58() === other.toBase58();
  }

  toBase58(): string {
    return this.address;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }

  toString(): string {
    return this.address;
  }
}

const getOrigin = (): string => {
  if (document.title) return document.title;

  return window.location.hostname;
};

const toWalletStandardAccount = ({ address, publicKey }: SolanaAccountInfo): SolanaWalletStandardAccount =>
  Object.freeze({
    address,
    publicKey: base58Decode(publicKey),
    chains: Object.freeze([SOLANA_MAINNET_CHAIN]),
    features: SOLANA_ACCOUNT_FEATURES,
  });

const sameAccounts = (a: readonly SolanaWalletStandardAccount[], b: readonly SolanaWalletStandardAccount[]): boolean =>
  JSON.stringify(a.map(({ address }) => address)) === JSON.stringify(b.map(({ address }) => address));

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  return bytes;
};

const requireEd25519Signature = (value: Uint8Array): Uint8Array => {
  if (value.byteLength !== 64) throw new Error('Solana signing returned an invalid Ed25519 signature');

  return value;
};

const normalizeSignMessageParams = (params: unknown): {
  display?: SolanaSignMessageRequest['display'];
  message: Uint8Array;
} => {
  if (params instanceof Uint8Array) return { message: params };
  if (Array.isArray(params) && params[0] instanceof Uint8Array) return { message: params[0], display: params[1] };

  if (params && typeof params === 'object') {
    const { display, message } = params as { display?: SolanaSignMessageRequest['display']; message?: unknown };

    if (message instanceof Uint8Array) return { display, message };
  }

  throw new Error('Solana signMessage expects a Uint8Array message');
};

const normalizeSignTransactionParams = (params: unknown): unknown => {
  if (params && typeof params === 'object' && 'transaction' in params) {
    return (params as { transaction: unknown }).transaction;
  }

  return params;
};

const normalizeSignAllTransactionsParams = (params: unknown): unknown[] => {
  if (Array.isArray(params)) return params;
  if (params && typeof params === 'object' && Array.isArray((params as { transactions?: unknown }).transactions)) {
    return (params as { transactions: unknown[] }).transactions;
  }

  throw new Error('Solana signAllTransactions expects a transaction array');
};

const normalizeSignAndSendTransactionParams = (params: unknown): SolanaSignAndSendTransactionInput => {
  if (Array.isArray(params)) {
    return {
      options: normalizeSignAndSendTransactionOptions(params[1]),
      transaction: params[0],
    };
  }

  if (params && typeof params === 'object' && 'transaction' in params) {
    const { options, transaction } = params as { options?: unknown; transaction: unknown };

    return {
      options: normalizeSignAndSendTransactionOptions(options),
      transaction,
    };
  }

  return { transaction: params };
};

const normalizeSignAndSendTransactionOptions = (
  value: unknown
): SolanaSignAndSendTransactionOptions | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Solana signAndSendTransaction expects an options object');
  }

  const { maxRetries, minContextSlot, preflightCommitment, skipPreflight } = value as SolanaSignAndSendTransactionOptions;
  const options: SolanaSignAndSendTransactionOptions = {};

  if (maxRetries !== undefined) options.maxRetries = maxRetries;
  if (minContextSlot !== undefined) options.minContextSlot = minContextSlot;
  if (preflightCommitment !== undefined) options.preflightCommitment = preflightCommitment;
  if (skipPreflight !== undefined) options.skipPreflight = skipPreflight;

  return options;
};

const toSerializedTransaction = <T>(transaction: T): SerializedTransactionInput<T> => {
  if (transaction instanceof Uint8Array) {
    return {
      restore: (bytes) => bytes,
      transactionBase64: bytesToBase64(transaction),
    };
  }

  const transactionLikeCandidate = transaction as unknown as Partial<SolanaTransactionLike>;

  if (
    transaction &&
    typeof transaction === 'object' &&
    typeof transactionLikeCandidate.serialize === 'function'
  ) {
    const transactionLike = transactionLikeCandidate as SolanaTransactionLike;
    const bytes = new Uint8Array(
      transactionLike.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
    );

    return {
      restore: (signedBytes) => {
        try {
          if (typeof transactionLike.constructor?.from === 'function') return transactionLike.constructor.from(signedBytes) as T;
          if (typeof transactionLike.constructor?.deserialize === 'function')
            return transactionLike.constructor.deserialize(signedBytes) as T;
        } catch {
          return signedBytes;
        }

        return signedBytes;
      },
      transactionBase64: bytesToBase64(bytes),
    };
  }

  throw new Error('Solana transaction signing expects a serialized transaction');
};

export class FearlessWalletSolanaProvider extends EventEmitter<SolanaEventName> implements FWSolanaProvider {
  readonly isFearlessWallet = true;
  readonly version = '1.0.0' as const;
  readonly name = eip6963ProviderInfo.name;
  readonly icon = eip6963ProviderInfo.icon;
  readonly chains = Object.freeze([SOLANA_MAINNET_CHAIN]);

  #accounts: readonly SolanaWalletStandardAccount[] = Object.freeze([]);
  #publicKey: SolanaPublicKeyLike | null = null;

  constructor() {
    super();

    this.refreshAccounts().catch(() => undefined);
    sendMessage('solana(events.subscribe)', null, ({ accounts }) => {
      this.applyAccounts(accounts);
    }).catch(() => undefined);
  }

  get accounts(): readonly SolanaWalletStandardAccount[] {
    return this.#accounts;
  }

  get connected(): boolean {
    return this.#accounts.length > 0;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get publicKey(): SolanaPublicKeyLike | null {
    return this.#publicKey;
  }

  get features(): Record<string, unknown> {
    return {
      'standard:connect': {
        version: '1.0.0',
        connect: (input?: SolanaConnectInput) => this.connect(input),
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: () => this.disconnect(),
      },
      'standard:events': {
        version: '1.0.0',
        on: (event: SolanaEventName, listener: (...args: unknown[]) => void) => {
          this.on(event, listener);

          return () => this.off(event, listener);
        },
      },
      'solana:signMessage': {
        version: '1.1.0',
        signMessage: (...inputs: readonly SolanaWalletStandardSignMessageInput[]) =>
          this.signWalletStandardMessages(inputs),
      },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: SOLANA_SUPPORTED_TRANSACTION_VERSIONS,
        signTransaction: (...inputs: readonly SolanaWalletStandardSignTransactionInput[]) =>
          this.signWalletStandardTransactions(inputs),
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: SOLANA_SUPPORTED_TRANSACTION_VERSIONS,
        signAndSendTransaction: (...inputs: readonly SolanaWalletStandardSignAndSendTransactionInput[]) =>
          this.signAndSendWalletStandardTransactions(inputs),
      },
    };
  }

  async connect(input: SolanaConnectInput = {}): Promise<SolanaConnectResponse> {
    const silent = input.onlyIfTrusted ?? input.silent ?? false;
    const response = silent
      ? await this.refreshAccounts()
      : await sendMessage('solana(authorizeUrl)', { origin: getOrigin(), silent: false });

    return this.applyAccounts(response.accounts);
  }

  async disconnect(): Promise<void> {
    await sendMessage('solana(disconnect)');
    this.applyAccounts([]);
  }

  async request<T = unknown>({ method, params }: { method: string; params?: unknown }): Promise<T> {
    switch (method) {
      case 'connect':
        return this.connect(params as SolanaConnectInput) as Promise<T>;
      case 'disconnect':
        await this.disconnect();

        return undefined as T;
      case 'signMessage': {
        const { display, message } = normalizeSignMessageParams(params);

        return this.signMessage(message, display) as Promise<T>;
      }
      case 'signTransaction':
        return this.signTransaction(normalizeSignTransactionParams(params)) as Promise<T>;
      case 'signAllTransactions':
        return this.signAllTransactions(normalizeSignAllTransactionsParams(params)) as Promise<T>;
      case 'signAndSendTransaction': {
        const { options, transaction } = normalizeSignAndSendTransactionParams(params);

        return this.signAndSendTransaction(transaction, options) as Promise<T>;
      }
      default:
        throw new Error(`Unsupported Solana request method: ${method}`);
    }
  }

  async signMessage(
    message: Uint8Array,
    display: SolanaSignMessageRequest['display'] = 'utf8'
  ): Promise<{ publicKey: SolanaPublicKeyLike; signature: Uint8Array }> {
    if (!(message instanceof Uint8Array)) throw new Error('Solana signMessage expects a Uint8Array message');

    await this.ensureConnected();

    const response = await sendMessage('solana(signMessage)', {
      display,
      messageBase64: bytesToBase64(message),
      origin: getOrigin(),
    });

    return {
      publicKey: new SolanaPublicKey(response.publicKey),
      signature: requireEd25519Signature(base64ToBytes(response.signatureBase64)),
    };
  }

  async signAndSendTransaction<T = unknown>(
    transaction: T,
    options?: SolanaSignAndSendTransactionOptions
  ): Promise<{ signature: string }> {
    const serialized = toSerializedTransaction(transaction);

    await this.ensureConnected();

    const response = await sendMessage('solana(signAndSendTransaction)', {
      options,
      origin: getOrigin(),
      transactionBase64: serialized.transactionBase64,
    } satisfies SolanaSignAndSendTransactionRequest);

    return { signature: response.signature };
  }

  async signTransaction<T = unknown>(transaction: T): Promise<T | Uint8Array> {
    const serialized = toSerializedTransaction(transaction);

    await this.ensureConnected();

    const response = await sendMessage('solana(signTransaction)', {
      origin: getOrigin(),
      transactionBase64: serialized.transactionBase64,
    });

    return serialized.restore(base64ToBytes(response.signedTransactionBase64));
  }

  async signAllTransactions<T = unknown>(transactions: T[]): Promise<Array<T | Uint8Array>> {
    const serializedTransactions = transactions.map(toSerializedTransaction);

    await this.ensureConnected();

    const response = await sendMessage('solana(signAllTransactions)', {
      origin: getOrigin(),
      transactionsBase64: serializedTransactions.map(({ transactionBase64 }) => transactionBase64),
    } satisfies SolanaSignAllTransactionsRequest);

    return response.signedTransactionsBase64.map((signedTransaction, index) =>
      serializedTransactions[index].restore(base64ToBytes(signedTransaction))
    );
  }

  private async refreshAccounts(): Promise<SolanaConnectResponse> {
    return sendMessage('solana(accounts)');
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;

    await this.connect();

    if (!this.connected) throw new Error('Solana account is not connected');
  }

  private requireWalletStandardInputs<T extends { account: SolanaWalletStandardAccount; chain?: string }>(
    inputs: readonly T[],
    { requireChain = false }: { requireChain?: boolean } = {}
  ): readonly T[] {
    if (!inputs.length) throw new Error('Solana Wallet Standard signing requires at least one input');

    inputs.forEach(({ account, chain }) => {
      const currentAccount = this.#accounts.find(({ address }) => address === account?.address);

      if (
        !currentAccount ||
        !(account.publicKey instanceof Uint8Array) ||
        !equalBytes(currentAccount.publicKey, account.publicKey)
      ) {
        throw new Error('Solana Wallet Standard account is not connected');
      }
      if (requireChain && chain === undefined) throw new Error('Solana Wallet Standard chain is required');
      if (chain !== undefined && chain !== SOLANA_MAINNET_CHAIN) {
        throw new Error(`Unsupported Solana Wallet Standard chain: ${chain}`);
      }
    });

    return inputs;
  }

  private async signWalletStandardMessages(
    inputs: readonly SolanaWalletStandardSignMessageInput[]
  ): Promise<readonly SolanaWalletStandardSignMessageOutput[]> {
    this.requireWalletStandardInputs(inputs);
    inputs.forEach(({ message }) => {
      if (!(message instanceof Uint8Array)) throw new Error('Solana Wallet Standard message must be a Uint8Array');
    });

    const outputs: SolanaWalletStandardSignMessageOutput[] = [];

    for (const { message } of inputs) {
      const { signature } = await this.signMessage(message);

      outputs.push({
        signature,
        signatureType: 'ed25519',
        signedMessage: message.slice(),
      });
    }

    return outputs;
  }

  private async signWalletStandardTransactions(
    inputs: readonly SolanaWalletStandardSignTransactionInput[]
  ): Promise<readonly SolanaWalletStandardSignTransactionOutput[]> {
    this.requireWalletStandardInputs(inputs);
    inputs.forEach(({ options, transaction }) => {
      normalizeWalletStandardTransactionOptions(options, false);
      if (!(transaction instanceof Uint8Array)) {
        throw new Error('Solana Wallet Standard transaction must be a Uint8Array');
      }
    });

    const signedTransactions = await this.signAllTransactions(inputs.map(({ transaction }) => transaction));

    return signedTransactions.map((signedTransaction) => ({
      signedTransaction: requireUint8Array(signedTransaction),
    }));
  }

  private async signAndSendWalletStandardTransactions(
    inputs: readonly SolanaWalletStandardSignAndSendTransactionInput[]
  ): Promise<readonly SolanaWalletStandardSignAndSendTransactionOutput[]> {
    this.requireWalletStandardInputs(inputs, { requireChain: true });
    const normalizedOptions = inputs.map(({ options, transaction }) => {
      if (!(transaction instanceof Uint8Array)) {
        throw new Error('Solana Wallet Standard transaction must be a Uint8Array');
      }

      return normalizeWalletStandardTransactionOptions(options, true);
    });

    const outputs: SolanaWalletStandardSignAndSendTransactionOutput[] = [];

    for (const [index, { transaction }] of inputs.entries()) {
      const options = normalizedOptions[index];
      const { signature } = await this.signAndSendTransaction(transaction, {
        maxRetries: options?.maxRetries,
        minContextSlot: options?.minContextSlot,
        preflightCommitment: options?.preflightCommitment,
        skipPreflight: options?.skipPreflight,
      });
      const signatureBytes = base58Decode(signature);

      outputs.push({ signature: requireEd25519Signature(signatureBytes) });
    }

    return outputs;
  }

  private applyAccounts(accounts: SolanaAccountInfo[]): SolanaConnectResponse {
    const previousAccounts = this.#accounts;
    const nextAccounts = Object.freeze(accounts.map(toWalletStandardAccount));

    this.#accounts = nextAccounts;
    this.#publicKey = nextAccounts[0] ? new SolanaPublicKey(nextAccounts[0].address) : null;

    if (!sameAccounts(previousAccounts, nextAccounts)) {
      this.emit('change', { accounts: nextAccounts });
      this.emit('accountChanged', this.#publicKey);

      if (previousAccounts.length === 0 && nextAccounts.length > 0) this.emit('connect', this.#publicKey);
      if (previousAccounts.length > 0 && nextAccounts.length === 0) this.emit('disconnect');
    }

    return { accounts };
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function requireUint8Array(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error('Solana signing returned an invalid transaction');

  return value;
}

function normalizeWalletStandardTransactionOptions(
  options: unknown,
  broadcast: boolean
): SolanaSignAndSendTransactionOptions | undefined {
  if (options === undefined) return undefined;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Invalid Solana Wallet Standard transaction options');
  }

  const input = options as Record<string, unknown>;
  const normalized: SolanaSignAndSendTransactionOptions = {};

  if (input.minContextSlot !== undefined) {
    if (!Number.isSafeInteger(input.minContextSlot) || (input.minContextSlot as number) < 0) {
      throw new Error('Invalid Solana Wallet Standard minimum context slot');
    }
    normalized.minContextSlot = input.minContextSlot as number;
  }
  if (input.preflightCommitment !== undefined) {
    if (!isSolanaCommitment(input.preflightCommitment)) {
      throw new Error('Invalid Solana Wallet Standard preflight commitment');
    }
    normalized.preflightCommitment = input.preflightCommitment;
  }

  if (!broadcast) return normalized;

  if (input.maxRetries !== undefined) {
    if (!Number.isInteger(input.maxRetries) || (input.maxRetries as number) < 0 || (input.maxRetries as number) > 10) {
      throw new Error('Invalid Solana Wallet Standard max retries');
    }
    normalized.maxRetries = input.maxRetries as number;
  }
  if (input.skipPreflight !== undefined) {
    if (typeof input.skipPreflight !== 'boolean') {
      throw new Error('Invalid Solana Wallet Standard skipPreflight option');
    }
    normalized.skipPreflight = input.skipPreflight;
  }
  if (input.commitment !== undefined) {
    if (!isSolanaCommitment(input.commitment)) {
      throw new Error('Invalid Solana Wallet Standard commitment');
    }
    throw new Error('Solana Wallet Standard commitment confirmation is not supported');
  }

  return normalized;
}

function isSolanaCommitment(value: unknown): value is 'processed' | 'confirmed' | 'finalized' {
  return value === 'processed' || value === 'confirmed' || value === 'finalized';
}

export function registerSolanaWalletStandard(wallet: FWSolanaProvider): void {
  const register = (api: WalletStandardRegisterApi): void => {
    try {
      api.register(wallet);
    } catch (error) {
      console.error('Unable to register Fearless Wallet Solana provider', error);
    }
  };

  window.addEventListener(
    'wallet-standard:app-ready',
    ((event: CustomEvent<WalletStandardRegisterApi>) => register(event.detail)) as EventListener
  );

  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
}
