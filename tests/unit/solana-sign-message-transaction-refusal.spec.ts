import { describe, expect, it, vi } from 'vitest';
import { base58Decode } from '@polkadot/util-crypto';
import SolanaRequestHandler from '@extension-base/services/request-service/handlers/SolanaRequestHandler';
import { resolveSolanaMessageSigning } from '@extension-base/services/request-service/handlers/solanaSigning';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { RequestService } from '@extension-base/services/request-service';
import type { SolanaRequestsSubjectPayload } from '@extension-base/services/request-service/types';

// Public test vectors only: the "site" is the second vector's address.
const vector = vectors.vectors[0];
const user = vector.expected.solana.address;
const site = vectors.vectors[1].expected.solana.address;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const account = { address: user, name: 'Universal', publicKey: user };
const compact = (value: number) => {
  const bytes: number[] = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>= 7;
    if (rest > 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest > 0);
  return bytes;
};
const concat = (...parts: Array<number[] | Uint8Array>) => Uint8Array.from(parts.flatMap((part) => [...part]));
const lamports = (value: bigint) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
};
const blockhash = new Uint8Array(32).fill(7);
// System Program transfer of 5 SOL from the user to the site.
const transfer = concat(compact(2), [2, 0, 0, 0], lamports(5_000_000_000n));
const legacyMessage = concat(
  [1, 0, 1], compact(3), base58Decode(user), base58Decode(site), base58Decode(SYSTEM_PROGRAM), blockhash,
  compact(1), [2], compact(2), [0, 1], compact(transfer.length), transfer
);
// The same transfer as a v0 message that also loads one account from a lookup table.
const v0Message = concat(
  [0x80, 1, 0, 1], compact(3), base58Decode(user), base58Decode(site), base58Decode(SYSTEM_PROGRAM), blockhash,
  compact(1), [2], compact(2), [0, 1], compact(transfer.length), transfer,
  compact(1), new Uint8Array(32).fill(9), compact(1), [0], compact(0)
);
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const createHandler = () => {
  const requestService = {
    authRequestHandler: { getSigningAuthorizationRevision: vi.fn(() => 0) },
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
  } as unknown as RequestService;
  return { handler: new SolanaRequestHandler(requestService), requestService };
};

describe('Solana signMessage never signs a transaction message', () => {
  it.each([
    ['legacy', legacyMessage],
    ['v0', v0Message],
  ])('refuses the bytes of a %s transfer message before any approval is shown', (_version, message) => {
    const { handler, requestService } = createHandler();

    expect(() =>
      handler.confirmSignMessage('https://dapp.example', { messageBase64: base64(message), origin: 'dApp' }, account)
    ).toThrow('Solana message payload is a transaction');
    expect(requestService.popupOpen).not.toHaveBeenCalled();
    expect(handler.signSolanaSubject.value).toEqual({});
  });

  it('still queues sign-in text and bytes that are not a whole transaction message', () => {
    const { handler, requestService } = createHandler();
    const signIn = new TextEncoder().encode(`dapp.example wants you to sign in with your Solana account:\n${user}`);

    for (const [id, message] of [
      ['sign-in', signIn],
      ['truncated', legacyMessage.slice(0, -1)],
    ] as const) {
      void handler
        .confirmSignMessage('https://dapp.example', { messageBase64: base64(message), origin: 'dApp' }, account, id)
        .catch(() => undefined);
    }

    expect(Object.keys(handler.signSolanaSubject.value)).toEqual(['sign-in', 'truncated']);
    expect(requestService.popupOpen).toHaveBeenCalledTimes(2);
  });

  it('refuses at signing time a queued message that is a transaction', () => {
    const request = {
      account,
      ecosystem: 'solana',
      id: 'queued-transaction',
      messageBase64: base64(legacyMessage),
      method: 'signMessage',
      origin: 'dApp',
      reject: vi.fn(),
      resolve: vi.fn(),
      url: 'https://dapp.example',
    } as SolanaRequestsSubjectPayload;

    expect(() =>
      resolveSolanaMessageSigning({
        accounts: [{ address: 'substrate-address', meta: { solanaAddress: user, walletEcosystem: 'substrate' } }],
        exportMnemonic: () => ({ seed: vector.mnemonic }),
        request,
      })
    ).toThrow('Solana message payload is a transaction');
  });
});
