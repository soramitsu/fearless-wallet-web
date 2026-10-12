import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet, getBytes, verifyMessage, verifyTypedData } from 'ethers';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { captureEvmSigningContext } from '@extension-base/services/request-service/handlers/evmSigningContext';

vi.mock('@polkadot/phishing', () => ({ checkIfDenied: vi.fn(async () => false) }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));
import Extension from '@extension-base/background/handlers/Extension';
import { WalletConnectDAppService } from '@extension-base/services/wallet-connect-service/dapp';
import type { RequestService } from '@extension-base/services/request-service';
import type State from '@extension-base/background/handlers/State';

// Public, unfunded test key. All network and mobile transport calls are stubs.
const wallet = new Wallet(`0x${'11'.repeat(32)}`);
const address = wallet.address;
const url = 'https://public.example';
const data = ['0x68656c6c6f', address];
let auth: { isAllowed: boolean; evmAuthorizedAccount: string; currentEvmNetworkKey: string };
let state: State;
let handler: EvmRequestHandler;
let extension: Extension;
let network: {
  name: string;
  chainId: string;
  genesisHash: string;
  isEthereum: boolean;
  ecosystem: string;
  disabled: boolean;
  assets: unknown[];
};
let mobile = false;

beforeEach(() => {
  mobile = false;
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
  handler = new EvmRequestHandler({ popupOpen: vi.fn(), updateIcon: vi.fn() } as unknown as RequestService);
  state = {
    getAuthInfo: vi.fn(async () => auth),
    getEvmApi: vi.fn(() => undefined),
    networkService: { networkMap: { Ethereum: network } },
    keyringService: {
      getSubstrateAddress: vi.fn(() => 'substrate-root'),
      getEthereumAddress: vi.fn(() => address),
      isMobileAccount: vi.fn(() => mobile),
      getAllAccounts: vi.fn(() => [
        { address: 'substrate-root', meta: { name: 'Public fixture', ethereumAddress: address } },
      ]),
      getAddresses: vi.fn(() => []),
      getAddress: vi.fn(() => ({ address: 'substrate-root', meta: { wcTopic: 'public-fixture-topic' } })),
      accountExportPrivateKey: vi.fn(() => ({ privateKey: wallet.privateKey })),
    },
    walletConnectDappService: { onEvmRequest: vi.fn(async () => ({ id: 'first', payload: '0x1234' })) },
    requestService: { evmRequestHandler: handler, getSignRequest: (id: string) => handler.getEvmSignRequest(id) },
  } as unknown as State;
  extension = new Extension(state);
});
async function queue(method = 'personal_sign', params: unknown[] = data) {
  const context = await captureEvmSigningContext(state, url, method, params);
  const result = handler.confirmSign('first', url, method, params, context);
  return { result, request: handler.getEvmSignRequest('first') };
}

afterEach(() => vi.restoreAllMocks());

describe('EVM approval uses the reviewed request context', () => {
  it('produces a real signature with the reviewed account', async () => {
    const { result } = await queue();
    await expect(extension.signEvmApprove({ id: 'first' })).resolves.toBe(true);
    const signature = await result;
    expect(verifyMessage('hello', signature.payload)).toBe(address);
    expect(state.keyringService.accountExportPrivateKey).toHaveBeenCalledExactlyOnceWith({ address });
    expect(handler.signEvmSubject.value).toEqual({});
  });
  it.each(['personal_sign', 'eth_sign'])('signs exact non-UTF8 bytes for %s', async (method) => {
    const bytes = '0xff00c080deadbeef';
    const params = method === 'personal_sign' ? [bytes, address] : [address, bytes];
    const { result } = await queue(method, params);
    await extension.signEvmApprove({ id: 'first' });
    expect(verifyMessage(getBytes(bytes), (await result).payload)).toBe(address);
  });
  it.each(['personal_sign', 'eth_sign'])('signs the empty byte message for %s', async (method) => {
    const params = method === 'personal_sign' ? ['0x', address] : [address, '0x'];
    const { result } = await queue(method, params);
    await extension.signEvmApprove({ id: 'first' });
    expect(verifyMessage(new Uint8Array(), (await result).payload)).toBe(address);
  });
  it.each(['0x1', '0xgg', 'hello', 12, null])(
    'rejects malformed message %j before queueing or key export',
    async (message) => {
      await expect(queue('personal_sign', [message, address])).rejects.toThrow();
      expect(handler.signEvmSubject.value).toEqual({});
      expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    }
  );
  it('preserves every byte value without a text round trip', async () => {
    const message = Uint8Array.from({ length: 256 }, (_, index) => index);
    const hex = `0x${Buffer.from(message).toString('hex')}`;
    const { result } = await queue('personal_sign', [hex, address]);
    await extension.signEvmApprove({ id: 'first' });
    expect(verifyMessage(message, (await result).payload)).toBe(address);
  });
  it.each([[[]], [['0x1234']], [['0x1234', address, 'ignored']]])(
    'rejects invalid message arity %j',
    async (params) => {
      await expect(queue('personal_sign', params)).rejects.toThrow();
      expect(handler.signEvmSubject.value).toEqual({});
      expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    }
  );
  it('does not forward malformed message bytes to a mobile wallet', async () => {
    mobile = true;
    await expect(queue('personal_sign', ['0xffg0', address])).rejects.toThrow();
    expect(state.walletConnectDappService.onEvmRequest).not.toHaveBeenCalled();
  });
  it.each([
    ['string false', 'eth_signTypedData_v4', { message: { approved: 'false' } }],
    ['numeric boolean', 'eth_signTypedData_v4', { message: { approved: 0 } }],
    ['wrong primary type', 'eth_signTypedData_v4', { primaryType: 'Different' }],
    ['unsigned message field', 'eth_signTypedData_v4', { message: { approved: false, hidden: 'not signed' } }],
    [
      'changed domain schema',
      'eth_signTypedData_v4',
      { types: { EIP712Domain: [], Permission: [{ name: 'approved', type: 'bool' }] } },
    ],
    [
      'v3 array',
      'eth_signTypedData_v3',
      { types: { Permission: [{ name: 'approved', type: 'bool[]' }] }, message: { approved: [false] } },
    ],
    ['legacy v1 interpreted as v4', 'eth_signTypedData_v1', {}],
  ])('rejects typed-data %s before queueing or key access', async (_name, method, change) => {
    const typed = {
      primaryType: 'Permission',
      domain: { name: 'Public fixture', chainId: 1 },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
        ],
        Permission: [{ name: 'approved', type: 'bool' }],
      },
      message: { approved: false },
      ...(change as object),
    };
    await expect(queue(method as string, [address, JSON.stringify(typed)])).rejects.toThrow();
    expect(handler.signEvmSubject.value).toEqual({});
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    expect(state.walletConnectDappService.onEvmRequest).not.toHaveBeenCalled();
  });
  it('also rejects ambiguous WalletConnect typed data before exporting a key', async () => {
    const request = {
      request: {
        topic: 'public-topic',
        params: {
          chainId: 'eip155:1',
          request: {
            method: 'eth_signTypedData_v4',
            params: [
              address,
              {
                primaryType: 'Permission',
                domain: { chainId: 1 },
                types: { Permission: [{ name: 'approved', type: 'bool' }] },
                message: { approved: 'false' },
              },
            ],
          },
        },
      },
      resolve: vi.fn(),
    };
    vi.spyOn(handler, 'claimWCSignRequest').mockReturnValue(request as never);
    vi.spyOn(handler, 'getSignWCRequest').mockReturnValue(request as never);
    await expect(extension.wcRequestApprove({ address, approvalId: 'public-approval' })).rejects.toThrow();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    expect(request.resolve).not.toHaveBeenCalled();
  });
  it.each([false, true])('never forwards an ambiguous typed Boolean for mobile=%s', async (isMobile) => {
    mobile = isMobile;
    await expect(
      queue('eth_signTypedData_v4', [
        address,
        {
          primaryType: 'Permission',
          domain: { chainId: 1 },
          types: { Permission: [{ name: 'approved', type: 'bool' }] },
          message: { approved: 'false' },
        },
      ])
    ).rejects.toThrow();
    expect(state.walletConnectDappService.onEvmRequest).not.toHaveBeenCalled();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    expect(handler.signEvmSubject.value).toEqual({});
  });
  it.each(['object', 'json'])('WalletConnect signs a real false Boolean from %s typed data', async (format) => {
    const typed = {
      primaryType: 'Permission',
      domain: { chainId: 1 },
      types: { Permission: [{ name: 'approved', type: 'bool' }] },
      message: { approved: false },
    };
    const request = {
      request: {
        topic: 'public-topic',
        params: {
          chainId: 'eip155:1',
          request: {
            method: 'eth_signTypedData_v4',
            params: [address, format === 'json' ? JSON.stringify(typed) : typed],
          },
        },
      },
      resolve: vi.fn(),
    };
    vi.spyOn(handler, 'claimWCSignRequest').mockReturnValue(request as never);
    vi.spyOn(handler, 'getSignWCRequest').mockReturnValue(request as never);
    await extension.wcRequestApprove({ address, approvalId: 'public-approval' });
    expect(request.resolve).toHaveBeenCalledTimes(1);
    const { payload } = request.resolve.mock.calls[0][0];
    expect(verifyTypedData(typed.domain, typed.types, typed.message, payload)).toBe(address);
    expect(verifyTypedData(typed.domain, typed.types, { approved: true }, payload)).not.toBe(address);
  });
  it('checks WalletConnect typed-data domain chain before key access', async () => {
    const request = {
      request: {
        topic: 'public-topic',
        params: {
          chainId: 'eip155:1',
          request: {
            method: 'eth_signTypedData_v4',
            params: [
              address,
              {
                primaryType: 'Permission',
                domain: { chainId: 2 },
                types: { Permission: [{ name: 'approved', type: 'bool' }] },
                message: { approved: false },
              },
            ],
          },
        },
      },
      resolve: vi.fn(),
    };
    vi.spyOn(handler, 'claimWCSignRequest').mockReturnValue(request as never);
    vi.spyOn(handler, 'getSignWCRequest').mockReturnValue(request as never);
    await expect(extension.wcRequestApprove({ address, approvalId: 'public-approval' })).rejects.toThrow('chain');
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('accepts an object payload and signs the exact false boolean', async () => {
    const typed = {
      primaryType: 'Permission',
      domain: { chainId: 1 },
      types: { Permission: [{ name: 'approved', type: 'bool' }] },
      message: { approved: false },
    };
    const { result } = await queue('eth_signTypedData_v4', [address, typed]);
    await extension.signEvmApprove({ id: 'first' });
    expect(verifyTypedData(typed.domain, typed.types, typed.message, (await result).payload)).toBe(address);
  });
  it('produces a real typed-data signature for the reviewed domain and account', async () => {
    const typed = {
      primaryType: 'Message',
      domain: { name: 'Public fixture', chainId: 1 },
      types: { Message: [{ name: 'contents', type: 'string' }] },
      message: { contents: 'hello' },
    };
    const { result } = await queue('eth_signTypedData_v4', [address, JSON.stringify(typed)]);
    await extension.signEvmApprove({ id: 'first' });
    expect(verifyTypedData(typed.domain, typed.types, typed.message, (await result).payload)).toBe(address);
  });
  it('broadcasts once with the reviewed chain forced into the transaction', async () => {
    const tx = { from: address, to: address, value: '0x1' };
    const { result } = await queue('eth_sendTransaction', [tx]);
    vi.mocked(state.getEvmApi).mockReturnValue({ api: { getNetwork: vi.fn(async () => ({ chainId: 1n })) } } as never);
    const send = vi.spyOn(Wallet.prototype, 'sendTransaction').mockResolvedValue({ hash: '0x1234' } as never);
    await extension.signEvmApprove({ id: 'first' });
    await expect(result).resolves.toEqual({ id: 'first', payload: '0x1234' });
    expect(send).toHaveBeenCalledExactlyOnceWith({ ...tx, chainId: 1n });
  });
  it('passes the exact reviewed JSON-RPC gas limit to ethers', async () => {
    const tx = { from: address, to: address, value: '0x1', gas: '0x5208', gasPrice: '0x3b9aca00' };
    const { result } = await queue('eth_sendTransaction', [tx]);
    vi.mocked(state.getEvmApi).mockReturnValue({ api: { getNetwork: vi.fn(async () => ({ chainId: 1n })) } } as never);
    const send = vi.spyOn(Wallet.prototype, 'sendTransaction').mockResolvedValue({ hash: '0x1234' } as never);
    await extension.signEvmApprove({ id: 'first' });
    await result;
    expect(send).toHaveBeenCalledExactlyOnceWith({
      from: address,
      to: address,
      value: '0x1',
      gasLimit: '0x5208',
      gasPrice: '0x3b9aca00',
      chainId: 1n,
    });
    expect(tx.gas).toBe('0x5208');
  });
  it('rejects conflicting gas limits before key export', async () => {
    const { request } = await queue('eth_sendTransaction', [
      { from: address, to: address, gas: '0x5208', gasLimit: '30000' },
    ]);
    vi.mocked(state.getEvmApi).mockReturnValue({ api: { getNetwork: vi.fn(async () => ({ chainId: 1n })) } } as never);
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow('Conflicting EVM gas limits');
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    expect(handler.getEvmSignRequest('first')).toBe(request);
  });
  it('does not replay a broadcast after an ambiguous transport failure', async () => {
    const { result } = await queue('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]);
    const rejected = expect(result).rejects.toThrow('response lost after submission');
    vi.mocked(state.getEvmApi).mockReturnValue({ api: { getNetwork: vi.fn(async () => ({ chainId: 1n })) } } as never);
    const send = vi
      .spyOn(Wallet.prototype, 'sendTransaction')
      .mockRejectedValue(new Error('response lost after submission'));
    await expect(extension.signEvmApprove({ id: 'first' })).resolves.toBe(false);
    await rejected;
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('preserves a raw mobile signature through the actual forwarding and approval path', async () => {
    mobile = true;
    const payload = await wallet.signMessage('hello');
    const send = vi.fn(async () => payload);
    const mobileService = Object.create(WalletConnectDAppService.prototype) as WalletConnectDAppService;
    Object.assign(mobileService, {
      state,
      app: { client: { request: send } },
      getSession: () => ({ namespaces: { eip155: { accounts: [`eip155:1:${address}`] } } }),
    });
    Object.assign(state, { walletConnectDappService: mobileService });
    const { result } = await queue();
    expect(send).not.toHaveBeenCalled();
    await extension.signEvmApprove({ id: 'first' });
    await expect(result).resolves.toEqual({ id: 'first', payload });
    expect(send).toHaveBeenCalledTimes(1);
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('refuses an exported key that does not belong to the reviewed account', async () => {
    const { result, request } = await queue();
    vi.mocked(state.keyringService.accountExportPrivateKey).mockReturnValue({
      privateKey: `0x${'22'.repeat(32)}`,
    } as never);
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow('reviewed account');
    expect(handler.getEvmSignRequest('first')).toBe(request);
    request.resolve({ id: 'first', payload: '0x1234' });
    await result;
  });
  it.each(['network', 'account', 'revocation', 'network identity', 'signer kind'])(
    'blocks a changed %s before key export',
    async (change) => {
      const { result, request } = await queue();
      if (change === 'network') auth.currentEvmNetworkKey = 'Unknown';
      if (change === 'account') auth.evmAuthorizedAccount = '0x2222222222222222222222222222222222222222';
      if (change === 'revocation') auth.isAllowed = false;
      if (change === 'network identity') network.chainId = '137';
      if (change === 'signer kind') mobile = true;
      await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow();
      expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
      expect(state.walletConnectDappService.onEvmRequest).not.toHaveBeenCalled();
      request.resolve({ id: 'first', payload: '0x1234' });
      await result;
    }
  );
  it('blocks a second approval while the first authorization read is pending', async () => {
    const { result } = await queue();
    let resume!: (value: typeof auth) => void;
    vi.mocked(state.getAuthInfo).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resume = resolve as typeof resume;
        })
    );
    const first = extension.signEvmApprove({ id: 'first' });
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow('already pending');
    resume(auth);
    await first;
    await result;
    expect(state.keyringService.accountExportPrivateKey).toHaveBeenCalledTimes(1);
  });
  it('does not sign when cancellation completes during the authorization read', async () => {
    const { result } = await queue();
    const rejected = expect(result).rejects.toThrow('Cancelled');
    let resume!: (value: typeof auth) => void;
    vi.mocked(state.getAuthInfo).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resume = resolve as typeof resume;
        })
    );
    const pending = extension.signEvmApprove({ id: 'first' });
    await vi.waitFor(() => expect(resume).toBeTypeOf('function'));
    extension.signingCancel({ id: 'first' });
    resume(auth);
    await expect(pending).rejects.toThrow('cancelled');
    await rejected;
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
  it('allows retry after an authorization transport error without leaving the request locked', async () => {
    const { result } = await queue();
    vi.mocked(state.getAuthInfo).mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow('storage unavailable');
    await extension.signEvmApprove({ id: 'first' });
    await result;
  });
  it('checks the RPC chain before exporting a transaction key', async () => {
    const { result, request } = await queue('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]);
    vi.mocked(state.getEvmApi).mockReturnValue({
      api: { getNetwork: vi.fn(async () => ({ chainId: 137n })) },
    } as never);
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow('reviewed network');
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    request.resolve({ id: 'first', payload: '0x1234' });
    await result;
  });
  it('revalidates after the RPC chain lookup before any broadcast', async () => {
    const { result, request } = await queue('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]);
    vi.mocked(state.getEvmApi).mockReturnValue({
      api: {
        getNetwork: vi.fn(async () => {
          auth.isAllowed = false;
          return { chainId: 1n };
        }),
      },
    } as never);
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    request.resolve({ id: 'first', payload: '0x1234' });
    await result;
  });
  it('settles the dApp request when the mobile wallet rejects instead of allowing a silent retry', async () => {
    mobile = true;
    const { result } = await queue();
    const rejected = expect(result).rejects.toThrow('User rejected on mobile');
    vi.mocked(state.walletConnectDappService.onEvmRequest).mockRejectedValueOnce(new Error('User rejected on mobile'));
    await expect(extension.signEvmApprove({ id: 'first' })).resolves.toBe(false);
    await rejected;
    expect(handler.signEvmSubject.value).toEqual({});
    await expect(extension.signEvmApprove({ id: 'first' })).rejects.toThrow();
    expect(state.walletConnectDappService.onEvmRequest).toHaveBeenCalledTimes(1);
  });
  it('forwards an explicitly approved mobile request once using its captured network', async () => {
    mobile = true;
    const { result, request } = await queue();
    expect(state.walletConnectDappService.onEvmRequest).not.toHaveBeenCalled();
    await extension.signEvmApprove({ id: 'first' });
    await result;
    expect(state.walletConnectDappService.onEvmRequest).toHaveBeenCalledExactlyOnceWith(
      'first',
      url,
      'personal_sign',
      data,
      'public-fixture-topic',
      request.network,
      expect.any(Function)
    );
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
  });
});

describe('mobile EVM request network binding', () => {
  function service(accounts: string[]) {
    const send = vi.fn(async () => `0x${'ab'.repeat(65)}`);
    const service = Object.create(WalletConnectDAppService.prototype) as WalletConnectDAppService;
    Object.assign(service, {
      state,
      app: { client: { request: send } },
      getSession: () => ({ namespaces: { eip155: { accounts } } }),
    });
    return { service, send };
  }
  it('forwards the captured chain instead of rereading the site network', async () => {
    const context = await captureEvmSigningContext(state, url, 'personal_sign', data);
    auth.currentEvmNetworkKey = 'Different';
    const { service: mobileService, send } = service([`eip155:1:${address}`]);
    await mobileService.onEvmRequest('first', url, 'personal_sign', data, 'fixture', context.network, vi.fn());
    expect(send).toHaveBeenCalledExactlyOnceWith({
      chainId: 'eip155:1',
      topic: 'fixture',
      request: { method: 'personal_sign', params: data },
    });
  });
  it.each(['personal_sign', 'eth_sendTransaction'])('preserves the raw mobile %s result', async (method) => {
    const params = method === 'personal_sign' ? data : [{ from: address, to: address, value: '0x1' }];
    const context = await captureEvmSigningContext(state, url, method, params);
    const { service: mobileService, send } = service([`eip155:1:${address}`]);
    const payload = `0x${'ab'.repeat(method === 'personal_sign' ? 65 : 32)}`;
    send.mockResolvedValueOnce(payload);
    await expect(
      mobileService.onEvmRequest('first', url, method, params, 'fixture', context.network, vi.fn())
    ).resolves.toEqual({ id: 'first', payload });
  });
  it.each([undefined, { payload: '0x1234' }, '0x', '0x123', 'not-hex'])(
    'rejects a malformed remote result %j',
    async (response) => {
      const context = await captureEvmSigningContext(state, url, 'personal_sign', data);
      const { service: mobileService, send } = service([`eip155:1:${address}`]);
      send.mockResolvedValueOnce(response as never);
      await expect(
        mobileService.onEvmRequest('first', url, 'personal_sign', data, 'fixture', context.network, vi.fn())
      ).rejects.toThrow();
    }
  );
  it('rejects a response that is not a transaction hash for a send request', async () => {
    const params = [{ from: address, to: address, value: '0x1' }];
    const context = await captureEvmSigningContext(state, url, 'eth_sendTransaction', params);
    const { service: mobileService, send } = service([`eip155:1:${address}`]);
    send.mockResolvedValueOnce('0x1234');
    await expect(
      mobileService.onEvmRequest('first', url, 'eth_sendTransaction', params, 'fixture', context.network, vi.fn())
    ).rejects.toThrow();
  });
  it('does not reuse account permission from a different session chain', async () => {
    const context = await captureEvmSigningContext(state, url, 'personal_sign', data);
    const { service: mobileService, send } = service([`eip155:137:${address}`]);
    await expect(
      mobileService.onEvmRequest('first', url, 'personal_sign', data, 'fixture', context.network, vi.fn())
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('WalletConnect EVM message bytes', () => {
  function queued(method: string, params: unknown[]) {
    const request = {
      request: { topic: 'fixture', params: { chainId: 'eip155:1', request: { method, params } } },
      resolve: vi.fn(),
      reject: vi.fn(),
    };
    vi.spyOn(handler, 'claimWCSignRequest').mockReturnValue(request as never);
    vi.spyOn(handler, 'getSignWCRequest').mockReturnValue(request as never);
    return request;
  }
  it.each(['personal_sign', 'eth_sign'])('preserves binary %s input on the wallet side', async (method) => {
    const bytes = '0xff00c080deadbeef';
    const request = queued(method, method === 'personal_sign' ? [bytes, address] : [address, bytes]);
    await extension.wcRequestApprove({ address: 'substrate-root', approvalId: 'fixture-approval' });
    expect(verifyMessage(getBytes(bytes), request.resolve.mock.calls[0][0].payload)).toBe(address);
  });
  it('uses the personal_sign position even when the message looks like an address', async () => {
    const message = '0x2222222222222222222222222222222222222222';
    const request = queued('personal_sign', [message, address]);
    await extension.wcRequestApprove({ address: 'substrate-root', approvalId: 'fixture-approval' });
    expect(verifyMessage(getBytes(message), request.resolve.mock.calls[0][0].payload)).toBe(address);
  });
  it('refuses a mismatched exported WalletConnect signing key', async () => {
    const request = queued('personal_sign', ['0x1234', address]);
    vi.mocked(state.keyringService.accountExportPrivateKey).mockReturnValue({
      privateKey: `0x${'22'.repeat(32)}`,
    } as never);
    await expect(
      extension.wcRequestApprove({ address: 'substrate-root', approvalId: 'fixture-approval' })
    ).rejects.toThrow('Exported key');
    expect(request.resolve).not.toHaveBeenCalled();
  });
  it.each(['malformed', 'wrong signer'])('rejects %s before exporting a WalletConnect key', async (reason) => {
    const request = queued('personal_sign', [
      reason === 'malformed' ? '0xg1' : '0x1234',
      reason === 'wrong signer' ? '0x2222222222222222222222222222222222222222' : address,
    ]);
    await expect(
      extension.wcRequestApprove({ address: 'substrate-root', approvalId: 'fixture-approval' })
    ).rejects.toThrow();
    expect(state.keyringService.accountExportPrivateKey).not.toHaveBeenCalled();
    expect(request.resolve).not.toHaveBeenCalled();
  });
});

describe('WalletConnect approval claims the actual queued intent', () => {
  function queued(id: number, method = 'personal_sign', params: unknown[] = data) {
    const result = handler.onWCSign({
      id,
      topic: 'public-topic',
      params: { chainId: 'eip155:1', request: { method, params } },
    } as never);
    const approvalId = handler.signWcSubject.value.find((request) => request.id === id)!.approvalId;
    return { result, approvalId };
  }
  it('does not sign or reject the same intent twice while signing is pending', async () => {
    const payload = await wallet.signMessage('hello');
    let finish!: (signature: string) => void;
    const sign = vi.spyOn(Wallet.prototype, 'signMessage').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result, approvalId } = queued(1);
    const approving = extension.wcRequestApprove({ address, approvalId });
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow('pending');
    expect(() => extension.wcRequestReject({ approvalId })).toThrow('pending');
    expect(state.keyringService.accountExportPrivateKey).toHaveBeenCalledTimes(1);
    finish(payload);
    await expect(approving).resolves.toBe(true);
    await expect(result).resolves.toEqual({ id: 'public-topic', payload });
    await expect(extension.wcRequestApprove({ address, approvalId })).rejects.toThrow('unavailable');
    expect(sign).toHaveBeenCalledTimes(1);
  });
  it('consumes an ambiguous broadcast failure without deleting the next same-session request', async () => {
    const first = queued(1, 'eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]);
    const rejected = expect(first.result).rejects.toThrow('response lost');
    const next = queued(2);
    const send = vi.spyOn(Wallet.prototype, 'sendTransaction').mockRejectedValue(new Error('response lost'));
    await expect(extension.wcRequestApprove({ address, approvalId: first.approvalId })).resolves.toBe(false);
    await rejected;
    await expect(extension.wcRequestApprove({ address, approvalId: first.approvalId })).rejects.toThrow('unavailable');
    expect(send).toHaveBeenCalledTimes(1);
    expect(handler.signWcSubject.value.map(({ id }) => id)).toEqual([2]);
    await extension.wcRequestApprove({ address, approvalId: next.approvalId });
    expect(verifyMessage('hello', (await next.result).payload)).toBe(address);
  });
  it('rejects only the supplied approval identity', async () => {
    const first = queued(1),
      next = queued(2);
    const rejected = expect(first.result).rejects.toThrow('USER_REJECTED');
    expect(extension.wcRequestReject({ approvalId: first.approvalId })).toBe(true);
    await rejected;
    expect(extension.wcRequestReject({ approvalId: first.approvalId })).toBe(false);
    expect(handler.signWcSubject.value.map(({ id }) => id)).toEqual([2]);
    await extension.wcRequestApprove({ address, approvalId: next.approvalId });
    await next.result;
  });
});
