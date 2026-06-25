import { handleResponse } from '@extension-base/page';
import { FearlessWalletSolanaProvider } from '@extension-base/page/FearlessWalletSolanaProvider';
import type {
  SolanaConnectResponse,
  SolanaSignAllTransactionsResponse,
  SolanaSignAndSendTransactionResponse,
  SolanaSignMessageResponse,
  SolanaSignTransactionResponse,
} from '@extension-base/page/types';
import type { MessageTypes, TransportRequestMessage } from '@extension-base/background/types/types';

const SOLANA_ADDRESS = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const RPC_SIGNATURE = '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN';

type PostedMessage = TransportRequestMessage<MessageTypes>;

const account = {
  address: SOLANA_ADDRESS,
  name: 'Universal',
  publicKey: SOLANA_ADDRESS,
};

let authorized: boolean;
let postedMessages: PostedMessage[];
let rejectNextSigningRequest: boolean;

const bytesBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Solana provider browser-boundary integration', () => {
  beforeEach(() => {
    authorized = false;
    postedMessages = [];
    rejectNextSigningRequest = false;
    document.title = 'Integrated Solana dApp';

    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      const request = message as PostedMessage;

      postedMessages.push(request);
      queueMicrotask(() => respondFromBackground(request));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects, signs all supported Solana payloads, broadcasts, and disconnects through page messaging', async () => {
    const provider = new FearlessWalletSolanaProvider();
    const accountChanged = vi.fn();
    const connected = vi.fn();
    const disconnected = vi.fn();

    provider.on('accountChanged', accountChanged);
    provider.on('connect', connected);
    provider.on('disconnect', disconnected);

    await flush();
    expect(provider.connected).toBe(false);

    await expect(provider.connect()).resolves.toEqual({ accounts: [account] });
    expect(provider.publicKey?.toBase58()).toBe(SOLANA_ADDRESS);
    expect(connected).toHaveBeenCalledOnce();
    expect(accountChanged).toHaveBeenLastCalledWith(expect.objectContaining({ address: SOLANA_ADDRESS }));

    const message = new TextEncoder().encode('Fearless Solana challenge');

    await expect(provider.signMessage(message)).resolves.toMatchObject({
      publicKey: expect.objectContaining({ address: SOLANA_ADDRESS }),
      signature: new Uint8Array([1, 2, 3, 4]),
    });

    await expect(provider.signTransaction(new Uint8Array([10, 11]))).resolves.toEqual(new Uint8Array([12, 13]));
    await expect(provider.signAllTransactions([new Uint8Array([20]), new Uint8Array([21])])).resolves.toEqual([
      new Uint8Array([22]),
      new Uint8Array([23]),
    ]);
    await expect(
      provider.signAndSendTransaction(new Uint8Array([30]), {
        maxRetries: 1,
        preflightCommitment: 'confirmed',
        skipPreflight: false,
      })
    ).resolves.toEqual({ signature: RPC_SIGNATURE });

    expect(postedMessages.map(({ message }) => message)).toEqual([
      'solana(accounts)',
      'solana(events.subscribe)',
      'solana(authorizeUrl)',
      'solana(signMessage)',
      'solana(signTransaction)',
      'solana(signAllTransactions)',
      'solana(signAndSendTransaction)',
    ]);
    expect(postedMessages[6].request).toMatchObject({
      options: {
        maxRetries: 1,
        preflightCommitment: 'confirmed',
        skipPreflight: false,
      },
      origin: 'Integrated Solana dApp',
      transactionBase64: bytesBase64(new Uint8Array([30])),
    });

    await provider.disconnect();

    expect(provider.connected).toBe(false);
    expect(disconnected).toHaveBeenCalledOnce();
  });

  it('keeps background rejection and malformed dApp payloads observable at the provider boundary', async () => {
    const provider = new FearlessWalletSolanaProvider();

    await flush();
    await provider.connect();

    rejectNextSigningRequest = true;

    await expect(provider.signMessage(new Uint8Array([1]))).rejects.toThrow('user rejected');
    await expect(provider.request({ method: 'signTransaction', params: { transaction: 'not-serialized' } })).rejects.toThrow(
      'serialized transaction'
    );
  });
});

function respondFromBackground(request: PostedMessage): void {
  if (rejectNextSigningRequest && request.message.startsWith('solana(sign')) {
    rejectNextSigningRequest = false;
    handleResponse({
      error: 'user rejected',
      id: request.id,
    } as never);

    return;
  }

  switch (request.message) {
    case 'solana(accounts)':
      respond(request.id, { accounts: authorized ? [account] : [] } satisfies SolanaConnectResponse);
      break;
    case 'solana(events.subscribe)':
      respond(request.id, true);
      break;
    case 'solana(authorizeUrl)':
      authorized = true;
      respond(request.id, { accounts: [account] } satisfies SolanaConnectResponse);
      break;
    case 'solana(disconnect)':
      authorized = false;
      respond(request.id, { accounts: [] } satisfies SolanaConnectResponse);
      break;
    case 'solana(signMessage)':
      respond(request.id, {
        publicKey: SOLANA_ADDRESS,
        signatureBase58: RPC_SIGNATURE,
        signatureBase64: bytesBase64(new Uint8Array([1, 2, 3, 4])),
      } satisfies SolanaSignMessageResponse);
      break;
    case 'solana(signTransaction)':
      respond(request.id, {
        publicKey: SOLANA_ADDRESS,
        signatureBase58: RPC_SIGNATURE,
        signedTransactionBase64: bytesBase64(new Uint8Array([12, 13])),
      } satisfies SolanaSignTransactionResponse);
      break;
    case 'solana(signAllTransactions)':
      respond(request.id, {
        publicKey: SOLANA_ADDRESS,
        signaturesBase58: [RPC_SIGNATURE, RPC_SIGNATURE],
        signedTransactionsBase64: [bytesBase64(new Uint8Array([22])), bytesBase64(new Uint8Array([23]))],
      } satisfies SolanaSignAllTransactionsResponse);
      break;
    case 'solana(signAndSendTransaction)':
      respond(request.id, {
        publicKey: SOLANA_ADDRESS,
        signature: RPC_SIGNATURE,
        signatureBase58: RPC_SIGNATURE,
        signedTransactionBase64: bytesBase64(new Uint8Array([31])),
      } satisfies SolanaSignAndSendTransactionResponse);
      break;
    default:
      handleResponse({
        error: `Unexpected message: ${request.message}`,
        id: request.id,
      } as never);
  }
}

function respond(id: string, response: unknown): void {
  handleResponse({
    id,
    response,
  } as never);
}
