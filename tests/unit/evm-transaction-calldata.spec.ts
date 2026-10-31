import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Transaction, Wallet } from 'ethers';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';
import { captureMobileTransactionIntent } from '@extension-base/services/wallet-connect-service/mobileTransaction';
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { EvmRequestPayload } from '@extension-base/services/request-service/types';
import { evmTransaction } from '@/util/evmTransaction';
import { signingReview } from '@/screens/extension-ui/signing/review';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

// Public, unfunded test key. Every network call is a stub.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const address = wallet.address;
const to = `0x${'22'.repeat(20)}`;
const calldata = '0xd0e30db0';
const url = 'https://public.example';
const auth = { isAllowed: true, evmAuthorizedAccount: address, currentEvmNetworkKey: 'Ethereum' };
const network = {
  name: 'Ethereum',
  chainId: '1',
  genesisHash: '0x1234',
  isEthereum: true,
  ecosystem: 'ethereum',
  disabled: false,
  assets: [{ symbol: 'ETH', precision: 18, isNative: true }],
};
let handler: EvmRequestHandler;
let state: State;
let extension: Extension;
let provider: ReturnType<typeof evmProvider>;

const evmProvider = () => ({
  getNetwork: vi.fn(async () => ({ chainId: 1n })),
  getTransactionCount: vi.fn(async () => 0),
  estimateGas: vi.fn(async () => 50000n),
  getFeeData: vi.fn(async () => ({ gasPrice: 1n, maxFeePerGas: null, maxPriorityFeePerGas: null })),
  // The wallet sends with eth_sendRawTransaction alone; the node answers with the transaction's hash.
  send: vi.fn(async (method: string, params: unknown[]) =>
    method === 'eth_sendRawTransaction' ? Transaction.from(params[0] as string).hash : null
  ),
});
const sentTransaction = () =>
  Transaction.from(provider.send.mock.calls.find(([method]) => method === 'eth_sendRawTransaction')![1][0] as string);
async function approve(tx: Record<string, unknown>) {
  const params = [{ from: address, to, value: '0x1', ...tx }];
  const context = await captureEvmSigningContext(state, url, 'eth_sendTransaction', params);
  void handler.confirmSign('first', url, 'eth_sendTransaction', params, context).catch(() => undefined);
  return extension.signEvmApprove({ id: 'first' });
}
const review = (tx: Record<string, unknown>) =>
  signingReview({
    id: 'public',
    url,
    method: 'eth_sendTransaction',
    data: [{ from: address, to, value: '0x1', ...tx }],
    account: { address, name: 'Public account', isMobile: false },
    network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
  } as EvmRequestPayload);

beforeEach(() => {
  provider = evmProvider();
  handler = new EvmRequestHandler({ popupOpen: vi.fn(), updateIcon: vi.fn() } as unknown as RequestService);
  state = {
    requestService: { evmRequestHandler: handler, getSignRequest: (id: string) => handler.getEvmSignRequest(id) },
    getAuthInfo: vi.fn(async () => auth),
    getEvmAuthorizationSnapshot: () => ({ authorization: auth, revision: 0 }),
    getEvmApi: vi.fn(() => ({ api: provider })),
    networkService: { networkMap: { Ethereum: network } },
    keyringService: {
      tonKeyring: { getAccounts: () => [] },
      getSubstrateAddress: vi.fn(() => 'substrate-root'),
      getEthereumAddress: vi.fn(() => address),
      isMobileAccount: vi.fn(() => false),
      getAllAccounts: vi.fn(() => [
        {
          address: 'substrate-root',
          meta: {
            name: 'Public fixture',
            ethereumAddress: address,
            walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION,
          },
        },
      ]),
      getAddresses: vi.fn(() => []),
      getAddress: vi.fn(() => undefined),
      accountExportPrivateKey: vi.fn(() => ({ privateKey: wallet.privateKey })),
    },
  } as unknown as State;
  extension = new Extension(state);
});

describe('JSON-RPC `input` calldata', () => {
  it('is signed and broadcast as the transaction data', async () => {
    expect(await approve({ input: calldata })).toBe(true);

    const signed = sentTransaction();
    expect(signed.to?.toLowerCase()).toBe(to);
    expect(signed.value).toBe(1n);
    expect(signed.data).toBe(calldata);
    expect(provider.estimateGas).toHaveBeenCalledWith(expect.objectContaining({ data: calldata }));
  });

  it('is accepted next to the same `data`, in any letter case', () => {
    expect(evmTransaction({ to, data: '0xD0E30DB0', input: calldata }).data).toBe(calldata);
  });

  it('refuses a request whose `input` and `data` differ, at review and at approval', async () => {
    expect(() => evmTransaction({ to, data: '0x', input: calldata })).toThrow('Conflicting EVM calldata');
    expect(review({ data: '0x', input: calldata }).blocked).toBe(true);
    await expect(approve({ data: '0x', input: calldata })).rejects.toThrow('Conflicting EVM calldata');
    expect(provider.send).not.toHaveBeenCalledWith('eth_sendRawTransaction', expect.anything());
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });

  it('refuses `input` that is not hex bytes', () => {
    for (const input of ['0x123', 'd0e30db0', null, 7])
      expect(() => evmTransaction({ to, input })).toThrow('Invalid EVM calldata');
  });

  it('is shown on the review as raw data to read, not as a plain transfer', () => {
    const result = review({ input: calldata });

    expect(result.blocked).toBe(false);
    expect(result.blind).toBe(true);
    expect(result.actions[0].kind).toBe('unknown');
    expect(result.raw).toContain(`"input": "${calldata}"`);
  });

  it('still keeps a mobile wallet from being sent a field it may read differently', () => {
    expect(() => captureMobileTransactionIntent([{ from: address, to, input: calldata }], address, '1')).toThrow(
      'Unsupported mobile transaction fields'
    );
  });
});
