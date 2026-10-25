import { handleResponse } from '@extension-base/page';
import {
  FearlessWalletSolanaProvider,
  registerSolanaWalletStandard,
} from '@extension-base/page/FearlessWalletSolanaProvider';
import type { FWSolanaProvider, SolanaConnectResponse } from '@extension-base/page/types';
import type { TransportRequestMessage } from '@extension-base/background/types/types';

const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const RPC_SIGNATURE =
  '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN';

type PostedMessage = TransportRequestMessage<never>;

const response = (id: string, body: SolanaConnectResponse) => {
  handleResponse({
    id,
    response: body,
  } as never);
};

const bytesBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

async function connectProvider(provider: FearlessWalletSolanaProvider, postedMessages: PostedMessage[]): Promise<void> {
  response(postedMessages[0].id, { accounts: [] });
  handleResponse({ id: postedMessages[1].id, response: true } as never);

  const connect = provider.connect();

  response(postedMessages[2].id, {
    accounts: [{ address: SOLANA_ADDRESS, publicKey: SOLANA_ADDRESS, name: 'Universal' }],
  });
  await connect;
}

describe('FearlessWalletSolanaProvider', () => {
  let postedMessages: PostedMessage[];

  beforeEach(() => {
    postedMessages = [];
    document.title = 'Solana dApp';

    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      postedMessages.push(message as PostedMessage);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses Solana-scoped background messages for connect, account refresh, and disconnect', async () => {
    const provider = new FearlessWalletSolanaProvider();

    expect(postedMessages[0]).toMatchObject({ message: 'solana(accounts)' });
    expect(postedMessages[1]).toMatchObject({ message: 'solana(events.subscribe)' });

    response(postedMessages[0].id, { accounts: [] });
    handleResponse({ id: postedMessages[1].id, response: true } as never);

    const connect = provider.connect();
    const connectMessage = postedMessages[2];

    expect(connectMessage).toMatchObject({
      message: 'solana(authorizeUrl)',
      request: { origin: 'Solana dApp', silent: false },
    });

    response(connectMessage.id, {
      accounts: [{ address: SOLANA_ADDRESS, publicKey: SOLANA_ADDRESS, name: 'Universal' }],
    });

    await expect(connect).resolves.toEqual({
      accounts: [{ address: SOLANA_ADDRESS, publicKey: SOLANA_ADDRESS, name: 'Universal' }],
    });
    expect(provider.connected).toBe(true);
    expect(provider.publicKey?.toBase58()).toBe(SOLANA_ADDRESS);
    expect(provider.accounts[0].chains).toEqual(['solana:mainnet']);

    const disconnect = provider.disconnect();
    const disconnectMessage = postedMessages[3];

    expect(disconnectMessage).toMatchObject({ message: 'solana(disconnect)' });

    response(disconnectMessage.id, { accounts: [] });
    await disconnect;

    expect(provider.connected).toBe(false);
    expect(provider.publicKey).toBeNull();
  });

  it('registers with Wallet Standard without replacing the wallet object', () => {
    const provider = { name: 'Fearless Wallet' } as FWSolanaProvider;
    const registered: FWSolanaProvider[] = [];

    window.addEventListener('wallet-standard:register-wallet', ((event: CustomEvent<(api: unknown) => void>) => {
      event.detail({ register: (wallet: FWSolanaProvider) => registered.push(wallet) });
    }) as EventListener);

    registerSolanaWalletStandard(provider);

    expect(registered).toEqual([provider]);
  });

  it('queues Solana message signing requests and reconstructs signature bytes', async () => {
    const provider = new FearlessWalletSolanaProvider();

    await connectProvider(provider, postedMessages);

    const message = new TextEncoder().encode('Fearless Solana challenge');
    const signing = provider.signMessage(message, 'utf8');
    await Promise.resolve();
    const signingMessage = postedMessages[3];

    expect(signingMessage).toMatchObject({
      message: 'solana(signMessage)',
      request: {
        display: 'utf8',
        messageBase64: bytesBase64(message),
        origin: 'Solana dApp',
      },
    });

    handleResponse({
      id: signingMessage.id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signatureBase58: '5wYdgrn7fYrqx1zLqYkMF5fhkMTL8pWfTgtmbuS4PV7b',
        signatureBase64: bytesBase64(new Uint8Array(64).fill(7)),
      },
    } as never);

    await expect(signing).resolves.toMatchObject({
      publicKey: expect.objectContaining({ address: SOLANA_ADDRESS }),
      signature: new Uint8Array(64).fill(7),
    });
  });

  it('exposes Wallet Standard signing features and batches transaction inputs', async () => {
    const provider = new FearlessWalletSolanaProvider();

    await connectProvider(provider, postedMessages);

    const account = provider.accounts[0];
    const features = provider.features as {
      'solana:signMessage': {
        version: string;
        signMessage: (...inputs: Array<{ account: typeof account; message: Uint8Array }>) => Promise<
          Array<{ signature: Uint8Array; signatureType: string; signedMessage: Uint8Array }>
        >;
      };
      'solana:signTransaction': {
        supportedTransactionVersions: readonly unknown[];
        signTransaction: (...inputs: Array<{ account: typeof account; chain?: string; transaction: Uint8Array }>) => Promise<
          Array<{ signedTransaction: Uint8Array }>
        >;
      };
      'solana:signAndSendTransaction': {
        signAndSendTransaction: (...inputs: Array<{
          account: typeof account;
          chain: string;
          options?: Record<string, unknown>;
          transaction: Uint8Array;
        }>) => Promise<Array<{ signature: Uint8Array }>>;
        supportedTransactionVersions: readonly unknown[];
      };
    };

    expect(account.features).toEqual([
      'solana:signMessage',
      'solana:signTransaction',
      'solana:signAndSendTransaction',
    ]);
    expect(features['solana:signMessage'].version).toBe('1.1.0');
    expect(features['solana:signTransaction'].supportedTransactionVersions).toEqual(['legacy', 0]);
    expect(features['solana:signAndSendTransaction'].supportedTransactionVersions).toEqual(['legacy', 0]);

    const message = new Uint8Array([1, 2, 3]);
    const messageSigning = features['solana:signMessage'].signMessage({ account, message });
    await Promise.resolve();
    const messageRequest = postedMessages[3];

    expect(messageRequest).toMatchObject({
      message: 'solana(signMessage)',
      request: { messageBase64: bytesBase64(message) },
    });
    handleResponse({
      id: messageRequest.id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signatureBase58: 'unused',
        signatureBase64: bytesBase64(new Uint8Array(64).fill(9)),
      },
    } as never);
    await expect(messageSigning).resolves.toEqual([
      {
        signature: new Uint8Array(64).fill(9),
        signatureType: 'ed25519',
        signedMessage: message,
      },
    ]);

    const first = new Uint8Array([4]);
    const second = new Uint8Array([5]);
    const transactionSigning = features['solana:signTransaction'].signTransaction(
      { account, chain: 'solana:mainnet', transaction: first },
      { account, transaction: second }
    );
    await Promise.resolve();
    const batchRequest = postedMessages[4];

    expect(batchRequest).toMatchObject({
      message: 'solana(signAllTransactions)',
      request: { transactionsBase64: [bytesBase64(first), bytesBase64(second)] },
    });
    handleResponse({
      id: batchRequest.id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signaturesBase58: ['sig-a', 'sig-b'],
        signedTransactionsBase64: [bytesBase64(new Uint8Array([14])), bytesBase64(new Uint8Array([15]))],
      },
    } as never);
    await expect(transactionSigning).resolves.toEqual([
      { signedTransaction: new Uint8Array([14]) },
      { signedTransaction: new Uint8Array([15]) },
    ]);

    const sending = features['solana:signAndSendTransaction'].signAndSendTransaction({
      account,
      chain: 'solana:mainnet',
      options: {
        maxRetries: 2,
        minContextSlot: 123,
        preflightCommitment: 'confirmed',
        skipPreflight: true,
      },
      transaction: new Uint8Array([16]),
    });
    await Promise.resolve();
    const sendRequest = postedMessages[5];

    expect(sendRequest).toMatchObject({
      message: 'solana(signAndSendTransaction)',
      request: {
        options: {
          maxRetries: 2,
          minContextSlot: 123,
          preflightCommitment: 'confirmed',
          skipPreflight: true,
        },
      },
    });
    handleResponse({
      id: sendRequest.id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signature: RPC_SIGNATURE,
        signatureBase58: RPC_SIGNATURE,
        signedTransactionBase64: bytesBase64(new Uint8Array([17])),
      },
    } as never);
    const sendResult = await sending;

    expect(sendResult).toHaveLength(1);
    expect(sendResult[0].signature).toHaveLength(64);
  });

  it('rejects empty, foreign-account, malformed, and wrong-chain Wallet Standard batches before prompting', async () => {
    const provider = new FearlessWalletSolanaProvider();

    await connectProvider(provider, postedMessages);

    const account = provider.accounts[0];
    const features = provider.features as Record<string, { [method: string]: (...inputs: unknown[]) => Promise<unknown> }>;
    const signMessage = features['solana:signMessage'].signMessage;
    const signTransaction = features['solana:signTransaction'].signTransaction;
    const signAndSendTransaction = features['solana:signAndSendTransaction'].signAndSendTransaction;
    const requestCount = postedMessages.length;

    await expect(signMessage()).rejects.toThrow('at least one input');
    await expect(
      signMessage({ account: { ...account, address: 'foreign' }, message: new Uint8Array([1]) })
    ).rejects.toThrow('not connected');
    await expect(
      signMessage({ account: { address: account.address }, message: new Uint8Array([1]) })
    ).rejects.toThrow('not connected');
    await expect(
      signTransaction(
        { account, chain: 'solana:mainnet', transaction: new Uint8Array([1]) },
        { account, chain: 'solana:devnet', transaction: new Uint8Array([2]) }
      )
    ).rejects.toThrow('Unsupported Solana Wallet Standard chain');
    await expect(
      signAndSendTransaction({ account, transaction: new Uint8Array([1]) })
    ).rejects.toThrow('chain is required');
    await expect(
      signAndSendTransaction(
        { account, chain: 'solana:mainnet', transaction: new Uint8Array([1]) },
        {
          account,
          chain: 'solana:mainnet',
          options: { commitment: 'finalized' },
          transaction: new Uint8Array([2]),
        }
      )
    ).rejects.toThrow('commitment confirmation is not supported');
    await expect(
      signAndSendTransaction({
        account,
        chain: 'solana:mainnet',
        options: { minContextSlot: -1 },
        transaction: new Uint8Array([1]),
      })
    ).rejects.toThrow('minimum context slot');
    await expect(
      signTransaction({ account, transaction: 'not-bytes' })
    ).rejects.toThrow('must be a Uint8Array');
    expect(postedMessages).toHaveLength(requestCount);
  });

  it('queues serialized Solana transaction and batch signing requests', async () => {
    const provider = new FearlessWalletSolanaProvider();

    await connectProvider(provider, postedMessages);

    const transaction = new Uint8Array([1, 2, 3, 4]);
    const signedTransaction = provider.signTransaction(transaction);
    await Promise.resolve();

    expect(postedMessages[3]).toMatchObject({
      message: 'solana(signTransaction)',
      request: {
        origin: 'Solana dApp',
        transactionBase64: bytesBase64(transaction),
      },
    });

    handleResponse({
      id: postedMessages[3].id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signatureBase58: '5wYdgrn7fYrqx1zLqYkMF5fhkMTL8pWfTgtmbuS4PV7b',
        signedTransactionBase64: bytesBase64(new Uint8Array([9, 8, 7])),
      },
    } as never);

    await expect(signedTransaction).resolves.toEqual(new Uint8Array([9, 8, 7]));

    const batch = provider.signAllTransactions([new Uint8Array([5]), new Uint8Array([6])]);
    await Promise.resolve();

    expect(postedMessages[4]).toMatchObject({
      message: 'solana(signAllTransactions)',
      request: {
        origin: 'Solana dApp',
        transactionsBase64: [bytesBase64(new Uint8Array([5])), bytesBase64(new Uint8Array([6]))],
      },
    });

    handleResponse({
      id: postedMessages[4].id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signedTransactionsBase64: [bytesBase64(new Uint8Array([7])), bytesBase64(new Uint8Array([8]))],
        signaturesBase58: ['sig-a', 'sig-b'],
      },
    } as never);

    await expect(batch).resolves.toEqual([new Uint8Array([7]), new Uint8Array([8])]);

    const sent = provider.signAndSendTransaction(new Uint8Array([10, 11]), {
      maxRetries: 2,
      minContextSlot: 123,
      preflightCommitment: 'processed',
      skipPreflight: true,
    });
    await Promise.resolve();

    expect(postedMessages[5]).toMatchObject({
      message: 'solana(signAndSendTransaction)',
      request: {
        options: {
          maxRetries: 2,
          minContextSlot: 123,
          preflightCommitment: 'processed',
          skipPreflight: true,
        },
        origin: 'Solana dApp',
        transactionBase64: bytesBase64(new Uint8Array([10, 11])),
      },
    });

    handleResponse({
      id: postedMessages[5].id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signature: '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN',
        signatureBase58: 'sig-local',
        signedTransactionBase64: bytesBase64(new Uint8Array([12, 13])),
      },
    } as never);

    await expect(sent).resolves.toEqual({
      signature: '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN',
    });

    const requested = provider.request({
      method: 'signAndSendTransaction',
      params: [new Uint8Array([12]), { minContextSlot: 456 }],
    });
    await Promise.resolve();

    expect(postedMessages[6]).toMatchObject({
      message: 'solana(signAndSendTransaction)',
      request: { options: { minContextSlot: 456 } },
    });
    handleResponse({
      id: postedMessages[6].id,
      response: {
        publicKey: SOLANA_ADDRESS,
        signature: RPC_SIGNATURE,
        signatureBase58: RPC_SIGNATURE,
        signedTransactionBase64: bytesBase64(new Uint8Array([13])),
      },
    } as never);
    await expect(requested).resolves.toEqual({ signature: RPC_SIGNATURE });
  });

  it('rejects malformed Solana signMessage provider params before posting a signing request', async () => {
    const provider = new FearlessWalletSolanaProvider();

    await expect(provider.request({ method: 'signMessage', params: { message: 'not-bytes' } })).rejects.toThrow(
      'Uint8Array'
    );
    expect(postedMessages).toHaveLength(2);

    await expect(
      provider.request({
        method: 'signAndSendTransaction',
        params: {
          options: 'not-options',
          transaction: new Uint8Array([1]),
        },
      })
    ).rejects.toThrow('options object');
    expect(postedMessages).toHaveLength(2);
  });
});
