import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EipService } from '@extension-base/services/eip-service';
import type State from '@extension-base/background/handlers/State';

vi.mock('@extension-base/background/helpers', () => ({ stripUrl: (url: string) => new URL(url).hostname }));
const address = '0x1111111111111111111111111111111111111111';
const otherAddress = '0x2222222222222222222222222222222222222222';
const url = 'https://public.example/path';
let auth: { isAllowed: boolean; evmAuthorizedAccount: string; currentEvmNetworkKey: string };
let state: State;
let queue: ReturnType<typeof vi.fn>;
let network: {
  name: string;
  chainId: string;
  genesisHash: string;
  isEthereum: boolean;
  ecosystem: string;
  disabled: boolean;
  assets: unknown[];
};

beforeEach(() => {
  auth = { isAllowed: true, evmAuthorizedAccount: address, currentEvmNetworkKey: 'Ethereum' };
  network = {
    name: 'Ethereum',
    chainId: '1',
    genesisHash: '0x1234',
    isEthereum: true,
    ecosystem: 'ethereum',
    disabled: false,
    assets: [{ symbol: 'ETH', precision: 18, isNative: true }],
  };
  queue = vi.fn().mockResolvedValue({ id: 'first', payload: '0x1234' });
  state = {
    getAuthInfo: vi.fn(async () => auth),
    getEvmAuthorizationSnapshot: () => ({ authorization: auth, revision: 0 }),
    networkService: { networkMap: { Ethereum: network } },
    keyringService: {
      getSubstrateAddress: vi.fn(() => 'substrate-root'),
      getEthereumAddress: vi.fn(() => address),
      isMobileAccount: vi.fn(() => false),
      getAllAccounts: vi.fn(() => [
        { address: 'substrate-root', meta: { name: 'Public fixture', ethereumAddress: address } },
      ]),
      getAddresses: vi.fn(() => []),
    },
    requestService: { evmRequestHandler: { confirmSign: queue } },
  } as unknown as State;
});
const sign = (method = 'personal_sign', params: unknown[] = ['0x1234', address]) =>
  new EipService(state).handleEvmRequest('first', url, { method, params });

describe('EVM signing admission', () => {
  it('queues the exact authorized account and network alongside the method and payload', async () => {
    await expect(sign()).resolves.toBe('0x1234');
    // Queued under a key the background mints, not the page's message id ('first').
    expect(queue).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^evm\./), url, 'personal_sign', ['0x1234', address], {
      authorizationRevision: 0,
      account: { address, name: 'Public fixture', isMobile: false },
      network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
    }, undefined);
  });
  it('supports an admitted registry EVM network absent from the legacy name allowlist', async () => {
    network.isEthereum = false;
    await expect(sign()).resolves.toBe('0x1234');
    expect(queue).toHaveBeenCalledOnce();
  });
  it.each(['revoked', 'wrong account', 'unknown network', 'disabled network', 'non-EVM network'])(
    'does not queue a request with %s',
    async (reason) => {
      if (reason === 'revoked') auth.isAllowed = false;
      if (reason === 'wrong account') auth.evmAuthorizedAccount = otherAddress;
      if (reason === 'unknown network') auth.currentEvmNetworkKey = 'Missing';
      if (reason === 'disabled network') network.disabled = true;
      if (reason === 'non-EVM network') network.ecosystem = 'substrate';
      await expect(sign()).rejects.toThrow();
      expect(queue).not.toHaveBeenCalled();
    }
  );
  it('never substitutes the address-shaped personal_sign message for the requested account', async () => {
    await expect(sign('personal_sign', [address, otherAddress])).rejects.toThrow();
    expect(queue).not.toHaveBeenCalled();
  });
  it.each(['eth_sendTransaction', 'eth_signTypedData_v4'])(
    'rejects a mismatched claimed chain for %s',
    async (method) => {
      const params =
        method === 'eth_sendTransaction'
          ? [{ from: address, to: otherAddress, value: '0x1', chainId: '0x89' }]
          : [address, JSON.stringify({ domain: { chainId: 137 }, types: {}, message: {} })];
      await expect(sign(method, params)).rejects.toThrow();
      expect(queue).not.toHaveBeenCalled();
    }
  );
  it('captures parameters before an asynchronous authorization lookup', async () => {
    let resolve!: (value: typeof auth) => void;
    vi.mocked(state.getAuthInfo).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done as typeof resolve;
        })
    );
    const data = [{ from: address, to: otherAddress, value: '0x1' }];
    const signing = sign('eth_sendTransaction', data);
    data[0].value = '0x9999';
    resolve(auth);
    await signing;
    expect(queue.mock.calls[0][3][0].value).toBe('0x1');
  });
});
