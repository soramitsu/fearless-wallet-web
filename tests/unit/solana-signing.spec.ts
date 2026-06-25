import {
  findSolanaSigningAccount,
  resolveSolanaMessageSigning,
  resolveSolanaSignAndSendTransaction,
  type SolanaKeyringAccount,
} from '@extension-base/services/request-service/handlers/solanaSigning';
import { base58Decode } from '@polkadot/util-crypto';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { SolanaRequestsSubjectPayload } from '@extension-base/services/request-service/types';
import type { SolanaSignAndSendTransactionOptions } from '@extension-base/page/types';

type BroadcastTransaction = (
  transactionBase64: string,
  options?: SolanaSignAndSendTransactionOptions
) => Promise<string>;

const vector = vectors.vectors[0];
const expected = vector.expected.solana;
const MESSAGE_BASE64 = 'RmVhcmxlc3MgU29sYW5hIGNoYWxsZW5nZQ==';
const RPC_SIGNATURE = '5NfHnqDyzT9qyfxZDq2sSskAMGuFZ3VRqW4EQxghKqrKYdKq6cZNW1J34w7qE6nGx1eDQe5s2eKxB2ZtE1xU9qgN';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

const account: SolanaKeyringAccount = {
  address: 'substrate-address',
  meta: {
    name: 'Universal',
    solanaAddress: expected.address,
    walletEcosystem: 'substrate',
  },
};

const request = (address = expected.address): SolanaRequestsSubjectPayload => ({
  account: {
    address,
    name: 'Universal',
    publicKey: address,
  },
  display: 'utf8',
  ecosystem: 'solana',
  id: 'solana-sign-1',
  messageBase64: MESSAGE_BASE64,
  method: 'signMessage',
  origin: 'dApp',
  reject: vi.fn(),
  resolve: vi.fn(),
  url: 'https://dapp.example',
});

const signAndSendRequest = (transactionBase64 = validTransactionBase64()): SolanaRequestsSubjectPayload => ({
  account: {
    address: expected.address,
    name: 'Universal',
    publicKey: expected.address,
  },
  ecosystem: 'solana',
  id: 'solana-send-1',
  method: 'signAndSendTransaction',
  options: {
    maxRetries: 2,
    preflightCommitment: 'finalized',
    skipPreflight: true,
  },
  origin: 'dApp',
  reject: vi.fn(),
  resolve: vi.fn(),
  transactionBase64,
  url: 'https://dapp.example',
});

describe('Solana signing approval helpers', () => {
  it('maps authorized Solana addresses back to the universal-wallet keyring account', () => {
    expect(findSolanaSigningAccount([account], expected.address)).toBe(account);
    expect(
      findSolanaSigningAccount(
        [
          {
            address: expected.address,
            meta: {
              walletEcosystem: 'solana',
            },
          },
        ],
        expected.address
      )?.address
    ).toBe(expected.address);
    expect(findSolanaSigningAccount([account], expected.address.toLowerCase())).toBeUndefined();
  });

  it('signs queued Solana messages from the stored mnemonic', () => {
    const response = resolveSolanaMessageSigning({
      accounts: [account],
      exportMnemonic: vi.fn(() => ({ seed: vector.mnemonic })),
      request: request(),
    });

    expect(response.publicKey).toBe(expected.address);
    expect('signatureBase58' in response).toBe(true);
    expect('signatureBase64' in response).toBe(true);
    if (!('signatureBase58' in response) || !('signatureBase64' in response)) throw new Error('Expected message signature');
    expect(response.signatureBase58).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/);
    expect(response.signatureBase64).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it('signs and broadcasts queued Solana transactions from the stored mnemonic', async () => {
    const rawTransaction = validTransactionBase64();
    const broadcastTransaction = vi.fn<BroadcastTransaction>(async () => RPC_SIGNATURE);
    const response = await resolveSolanaSignAndSendTransaction({
      accounts: [account],
      broadcastTransaction,
      exportMnemonic: vi.fn(() => ({ seed: vector.mnemonic })),
      request: signAndSendRequest(rawTransaction),
    });
    const signedTransactionBase64 = broadcastTransaction.mock.calls[0]?.[0];

    if (!signedTransactionBase64) throw new Error('Expected signed transaction broadcast');

    expect(broadcastTransaction).toHaveBeenCalledOnce();
    expect(broadcastTransaction).toHaveBeenCalledWith(expect.any(String), {
      maxRetries: 2,
      preflightCommitment: 'finalized',
      skipPreflight: true,
    });
    expect(signedTransactionBase64).not.toBe(rawTransaction);
    expect(response).toMatchObject({
      publicKey: expected.address,
      signature: RPC_SIGNATURE,
      signedTransactionBase64,
    });
    expect(response.signatureBase58).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,128}$/);
  });

  it('rejects invalid Solana sign-and-send approval payloads before broadcasting', async () => {
    const broadcastTransaction = vi.fn<BroadcastTransaction>(async () => RPC_SIGNATURE);

    await expect(
      resolveSolanaSignAndSendTransaction({
        accounts: [account],
        broadcastTransaction,
        exportMnemonic: vi.fn(() => ({ seed: vector.mnemonic })),
        request: {
          ...signAndSendRequest(),
          method: 'signTransaction',
        },
      })
    ).rejects.toThrow('Invalid Solana sign-and-send request');
    await expect(
      resolveSolanaSignAndSendTransaction({
        accounts: [account],
        broadcastTransaction,
        exportMnemonic: vi.fn(() => ({ seed: vector.mnemonic })),
        request: {
          ...signAndSendRequest(),
          transactionBase64: '',
        },
      })
    ).rejects.toThrow('Invalid Solana transaction payload');
    await expect(
      resolveSolanaSignAndSendTransaction({
        accounts: [account],
        broadcastTransaction: vi.fn(async () => {
          throw new Error('rpc rejected');
        }),
        exportMnemonic: vi.fn(() => ({ seed: vector.mnemonic })),
        request: signAndSendRequest(),
      })
    ).rejects.toThrow('rpc rejected');
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });

  it('rejects missing accounts, mobile accounts, missing seed material, and account mismatches', () => {
    expect(() =>
      resolveSolanaMessageSigning({
        accounts: [],
        exportMnemonic: vi.fn(() => ({ seed: vector.mnemonic })),
        request: request(),
      })
    ).toThrow('Unable to find Solana signing account');
    expect(() =>
      resolveSolanaMessageSigning({
        accounts: [{ ...account, meta: { ...account.meta, isMobile: true } }],
        exportMnemonic: vi.fn(() => ({ seed: vector.mnemonic })),
        request: request(),
      })
    ).toThrow('Solana mobile signing is not supported');
    expect(() =>
      resolveSolanaMessageSigning({
        accounts: [account],
        exportMnemonic: vi.fn(() => ({ seed: '' })),
        request: request(),
      })
    ).toThrow('Unable to export Solana signing seed');
    expect(() =>
      resolveSolanaMessageSigning({
        accounts: [account],
        exportMnemonic: vi.fn(() => ({ seed: vectors.vectors[1].mnemonic })),
        request: request(),
      })
    ).toThrow('Solana signing account mismatch');
  });
});

function compact(value: number): number[] {
  const result: number[] = [];
  let next = value;

  do {
    let byte = next & 0x7f;

    next >>= 7;
    if (next > 0) byte |= 0x80;
    result.push(byte);
  } while (next > 0);

  return result;
}

function bytes(...chunks: Array<number[] | Uint8Array>): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function key(address: string): Uint8Array {
  return base58Decode(address);
}

function legacyMessage(): Uint8Array {
  return bytes(
    [1, 0, 1],
    compact(2),
    key(expected.address),
    key(SYSTEM_PROGRAM),
    new Uint8Array(32).fill(9),
    compact(1),
    [1],
    compact(1),
    [0],
    compact(0)
  );
}

function transaction(message: Uint8Array): Uint8Array {
  return bytes(compact(1), new Uint8Array(64), message);
}

function validTransactionBase64(): string {
  return Buffer.from(transaction(legacyMessage())).toString('base64');
}
