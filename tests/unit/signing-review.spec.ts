import { describe, expect, it } from 'vitest';
import { base58Decode } from '@polkadot/util-crypto';
import type { EvmRequestPayload, SolanaRequestPayload } from '@extension-base/services/request-service/types';
import type { SigningRequest } from '@extension-base/background/types/types';
import { reviewJson, signingReview } from '@/screens/extension-ui/signing/review';
import { signingRequester } from '@/screens/extension-ui/signing/requester';

const address = '0x1111111111111111111111111111111111111111';
const evm = (method: string, data: unknown): EvmRequestPayload => ({
  id: 'public',
  url: 'https://public.example',
  method,
  data,
  account: { address, name: 'Public account', isMobile: false },
  network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
});
const SYSTEM = '11111111111111111111111111111111';
const sender = '9xQeWvG816bUx9EPfRrvRqLbBoRNMr6gwCsugB5tfMZW';
const recipient = 'So11111111111111111111111111111111111111112';
function transaction(program = SYSTEM, data = [2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], indexes = [0, 1]) {
  return Buffer.from([
    1,
    ...new Uint8Array(64),
    1,
    0,
    1,
    3,
    ...base58Decode(sender),
    ...base58Decode(recipient),
    ...base58Decode(program),
    ...new Uint8Array(32).fill(7),
    1,
    2,
    indexes.length,
    ...indexes,
    data.length,
    ...data,
  ]).toString('base64');
}
const solana = (
  method: SolanaRequestPayload['method'],
  props: Partial<SolanaRequestPayload> = {}
): SolanaRequestPayload => ({
  id: 'public',
  url: 'https://public.example',
  origin: 'Untrusted title',
  ecosystem: 'solana',
  method,
  account: { address: sender, publicKey: sender },
  ...props,
});

describe('signing summaries describe the exact payload', () => {
  it.each(['personal_sign', 'eth_sign'])('decodes readable %s bytes and retains the complete raw request', (method) => {
    const data = method === 'personal_sign' ? ['0x68656c6c6f', address] : [address, '0x68656c6c6f'];
    const result = signingReview(evm(method, data));
    expect(result).toMatchObject({
      blind: false,
      blocked: false,
      network: 'Ethereum',
      networkIdentity: '1',
      feeKind: 'signOnly',
    });
    expect(result.actions).toEqual([{ kind: 'message', text: 'hello' }]);
    expect(JSON.parse(result.raw)).toEqual(data);
  });
  it.each(['0xff', '0x', '0x61e280ae62', '0x610062'])('requires blind consent for non-readable bytes %s', (data) => {
    expect(signingReview(evm('personal_sign', [data, address]))).toMatchObject({ blind: true, blocked: false });
  });
  it('blocks malformed byte data', () => {
    expect(signingReview(evm('personal_sign', ['0x1', address])).blocked).toBe(true);
  });
  it('shows exact native units above the JavaScript safe-integer range', () => {
    const result = signingReview(
      evm('eth_sendTransaction', [
        { from: address, to: address, value: '1000000000000000001', gas: '0x5208', gasPrice: '1000000000' },
      ])
    );
    expect(result.actions[0]).toMatchObject({
      kind: 'transfer',
      amount: '1.000000000000000001 ETH',
      from: address,
      to: address,
    });
    expect(result).toMatchObject({ blind: true, fee: '0.000021 ETH', feeKind: 'maximum' });
  });
  it('does not call empty calldata fully decoded without destination-code evidence', () => {
    const result = signingReview(evm('eth_sendTransaction', [{ from: address, to: address, value: '0' }]));
    expect(result.blind).toBe(true);
    expect(result.actions).toMatchObject([{ kind: 'transfer', amount: '0.0 ETH' }, { kind: 'unknown' }]);
  });
  it.each([{ data: '0x1234' }, { authorizationList: [] }, { accessList: [] }, { blobs: ['0x'] }])(
    'requires raw review for additional transaction semantics %j',
    (extra) => {
      const result = signingReview(evm('eth_sendTransaction', [{ from: address, to: address, value: '1', ...extra }]));
      expect(result.blind).toBe(true);
      expect(result.actions[0].kind).toBe('unknown');
    }
  );
  it('never borrows native units from an unrelated network', () => {
    const request = evm('eth_sendTransaction', [{ from: address, to: address, value: '1' }]);
    delete request.network.symbol;
    delete request.network.decimals;
    expect(signingReview(request)).toMatchObject({
      blind: true,
      feeKind: 'unavailable',
      actions: [{ amount: '1 wei' }, { kind: 'unknown' }],
    });
  });
  it('shows typed domain and message and identifies schema omissions as blind', () => {
    const typed = {
      primaryType: 'Permit',
      domain: { name: 'Public fixture', chainId: 1 },
      types: { Permit: [{ name: 'spender', type: 'address' }] },
      message: { spender: address },
    };
    expect(signingReview(evm('eth_signTypedData_v4', [address, JSON.stringify(typed)]))).toMatchObject({
      blind: false,
      actions: [{ kind: 'typedData' }],
    });
    expect(
      signingReview(
        evm('eth_signTypedData_v4', [
          address,
          JSON.stringify({ ...typed, message: { ...typed.message, unsigned: 'safe' } }),
        ])
      ).blind
    ).toBe(true);
    expect(
      signingReview(evm('eth_signTypedData_v4', [address, JSON.stringify({ ...typed, primaryType: 'Other' })])).blind
    ).toBe(true);
  });
  it('does not claim V3 arrays have been decoded with V3 semantics', () => {
    const typed = {
      primaryType: 'List',
      domain: {},
      types: { List: [{ name: 'values', type: 'uint256[]' }] },
      message: { values: ['1'] },
    };
    expect(signingReview(evm('eth_signTypedData_v3', [address, JSON.stringify(typed)])).blind).toBe(true);
    expect(signingReview(evm('eth_signTypedData_v4', [address, JSON.stringify(typed)])).blind).toBe(false);
  });
  it('decodes each SOL transfer and retains separate batch transaction numbers', () => {
    const result = signingReview(solana('signAllTransactions', { transactionsBase64: [transaction(), transaction()] }));
    expect(result.actions).toEqual(
      [1, 2].map((transactionIndex) => ({
        kind: 'transfer',
        from: sender,
        to: recipient,
        amount: '0.000000001 SOL',
        program: SYSTEM,
        transactionIndex,
      }))
    );
    expect(result).toMatchObject({ blind: false, blocked: false, feeKind: 'signOnly' });
    expect(result.network).toBeUndefined();
  });
  it('labels mainnet only for the method whose backend broadcasts there', () => {
    const result = signingReview(
      solana('signAndSendTransaction', { transactionBase64: transaction(), fee: { status: 'ready', lamports: 5000 } })
    );
    expect(result).toMatchObject({ network: 'Solana Mainnet', fee: '0.000005 SOL', feeKind: 'estimate' });
  });
  it('does not mistake a simulation result or an unknown program for a decoded instruction', () => {
    const result = signingReview(
      solana('signAndSendTransaction', { transactionBase64: transaction(recipient), simulation: { status: 'success' } })
    );
    expect(result).toMatchObject({
      blind: true,
      feeKind: 'unavailable',
      actions: [{ kind: 'unknown', program: recipient }],
    });
  });
  it('uses exact Substrate bytes and no selected-network inference for raw signatures', () => {
    const request = {
      id: 'public',
      url: 'https://public.example',
      account: { address: sender },
      request: { payload: { address: sender, data: '0x68656c6c6f', type: 'bytes' } },
    } as SigningRequest;
    expect(signingReview(request)).toMatchObject({
      protocol: 'Substrate',
      method: 'signRaw',
      blind: false,
      actions: [{ text: 'hello' }],
    });
    expect(signingReview(request).network).toBeUndefined();
  });
  it('renders bidi formatting characters literally in raw data', () => {
    expect(reviewJson({ message: 'abc\u202edef' })).toContain('abc\\u202edef');
    expect(reviewJson(undefined)).toBe('');
  });
});

describe('requester origin display', () => {
  it.each([
    ['https://safe.example.evil.co.uk/path', 'evil.co.uk', 'https://safe.example.'],
    ['https://app.public.github.io/path', 'public.github.io', 'https://app.'],
    ['https://safe.example@evil.example/path', 'evil.example', 'https://'],
    ['http://127.0.0.1:8080/path', '127.0.0.1', 'http://'],
    ['http://[::1]:8080/path', '[::1]', 'http://'],
    ['https://éxample.com/path', 'xn--xample-9ua.com', 'https://'],
  ])('emphasizes the actual registrable host for %s', (url, domain, before) => {
    const result = signingRequester(url);
    expect(result).toMatchObject({ domain, before });
    expect(result.before + result.domain + result.after).toBe(new URL(url).origin);
  });
  it('escapes deceptive control characters in an invalid origin', () => {
    expect(signingRequester('not-a-url\u202e')).toMatchObject({ domain: 'not-a-url\\u202e' });
  });
});
