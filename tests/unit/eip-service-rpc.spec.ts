import { describe, expect, it, vi } from 'vitest';
import { EipService } from '@extension-base/services/eip-service';
import type State from '@extension-base/background/handlers/State';
import { APP_VERSION } from '@/consts/global';

const request = { method: 'eth_getBalance', params: ['0x1234', 'latest'] };
const url = 'https://dapp.example';

function createService() {
  const send = vi.fn();
  const api: Record<string, { api: { _send: typeof send } | undefined }> = {
    ethereum: { api: { _send: send } },
  };
  const state = {
    getAuthInfo: vi.fn().mockResolvedValue({ currentEvmNetworkKey: 'Ethereum' }),
    requestService: { getEvmNetworkInfo: vi.fn().mockReturnValue({ name: 'Ethereum', chainId: 1 }) },
    networkService: { evmApiHandler: { api } },
  };

  return { service: new EipService(state as unknown as State), send, api, state };
}

describe('EIP service RPC request settlement', () => {
  it.each(['1', '137', '9007199254740993'])('returns decimal network %s without numeric precision loss', async (chainId) => {
    const { service, state } = createService();
    state.requestService.getEvmNetworkInfo.mockReturnValue({ name: 'Ethereum', chainId: chainId as unknown as number });
    await expect(service.handleEvmRequest('network', url, { method: 'net_version' })).resolves.toBe(chainId);
  });

  it('returns the wallet client version independently of the selected network', async () => {
    const { service } = createService();
    await expect(service.handleEvmRequest('version', url, { method: 'web3_clientVersion' })).resolves.toBe(`Fearless Wallet v${APP_VERSION}`);
  });

  it.each(['eth_accounts', 'wallet_getPermissions'])('settles %s when authorization storage rejects', async (method) => {
    const { service, state } = createService();
    const failure = new Error('Authorization storage unavailable');
    state.getAuthInfo.mockRejectedValue(failure);
    await expect(service.handleEvmRequest('request-1', url, { method })).rejects.toBe(failure);
  });

  it.each([undefined, {}, { evmAuthorizedAccount: '' }])('returns no accounts for an unshared site: %j', async (authorization) => {
    const { service, state } = createService();
    state.getAuthInfo.mockResolvedValue(authorization);
    await expect(service.handleEvmRequest('request-1', url, { method: 'eth_accounts' })).resolves.toEqual([]);
    await expect(service.handleEvmRequest('request-2', url, { method: 'wallet_getPermissions' })).resolves.toEqual([]);
  });

  it('reports the account permission only for an explicitly allowed site', async () => {
    const { service, state } = createService();
    state.getAuthInfo.mockResolvedValue({ isAllowed: true, evmAuthorizedAccount: '0x1234' });
    await expect(service.handleEvmRequest('permissions', url, { method: 'wallet_getPermissions' })).resolves.toMatchObject([
      { invoker: url, parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: ['0x1234'] }] },
    ]);
  });

  it('reads the latest authorization after a grant is revoked', async () => {
    const { service, state } = createService();
    state.getAuthInfo.mockResolvedValueOnce({ isAllowed: true, evmAuthorizedAccount: '0x1234' }).mockResolvedValueOnce(undefined);
    await expect(service.handleEvmRequest('request-1', url, { method: 'eth_accounts' })).resolves.toEqual(['0x1234']);
    await expect(service.handleEvmRequest('request-2', url, { method: 'eth_accounts' })).resolves.toEqual([]);
  });

  it.each([false, undefined, null, 'false', 'true', 1])(
    'does not disclose a retained account without an explicit grant: %j',
    async (isAllowed) => {
      const { service, state } = createService();
      state.getAuthInfo.mockResolvedValue({ isAllowed, evmAuthorizedAccount: '0x1234' });
      await expect(service.handleEvmRequest('accounts', url, { method: 'eth_accounts' })).resolves.toEqual([]);
      await expect(service.handleEvmRequest('permissions', url, { method: 'wallet_getPermissions' })).resolves.toEqual([]);
    }
  );

  it('returns successful JSON-RPC results to the dApp with the original request payload', async () => {
    const { service, send } = createService();
    send.mockResolvedValue([{ id: 'request-1', jsonrpc: '2.0', result: '0x42' }]);

    await expect(service.handleEvmRequest('request-1', url, request)).resolves.toBe('0x42');
    expect(send).toHaveBeenCalledWith({ id: 'request-1', jsonrpc: '2.0', ...request });
  });

  it('propagates asynchronous transport failures instead of leaving the dApp request pending', async () => {
    const { service, send } = createService();
    const error = new Error('RPC connection closed');
    send.mockRejectedValue(error);

    await expect(service.handleEvmRequest('request-1', url, request)).rejects.toBe(error);
  });

  it('preserves JSON-RPC error codes, messages and data', async () => {
    const { service, send } = createService();
    const error = { code: -32000, message: 'execution reverted', data: '0x08c379a0' };
    send.mockResolvedValue([{ id: 'request-1', jsonrpc: '2.0', error }]);

    await expect(service.handleEvmRequest('request-1', url, request)).rejects.toEqual(error);
  });

  it.each([null, false, 0, ''])('preserves valid falsy RPC results: %j', async (result) => {
    const { service, send } = createService();
    send.mockResolvedValue([{ id: 'request-1', jsonrpc: '2.0', result }]);

    await expect(service.handleEvmRequest('request-1', url, request)).resolves.toBe(result);
  });

  it.each(
    [undefined, null, [], [null], ['invalid'], [{ id: 'request-1', jsonrpc: '2.0' }]].map((response) => ({ response }))
  )('rejects malformed RPC responses: $response', async ({ response }) => {
    const { service, send } = createService();
    send.mockResolvedValue(response);

    await expect(service.handleEvmRequest('request-1', url, request)).rejects.toThrow('Invalid EVM RPC response');
  });

  it.each(['provider', 'network'])('rejects explicitly when the %s is unavailable', async (missing) => {
    const { service, send, api } = createService();
    if (missing === 'provider') api.ethereum.api = undefined;
    else delete api.ethereum;

    await expect(service.handleEvmRequest('request-1', url, request)).rejects.toThrow('EVM provider is unavailable');
    expect(send).not.toHaveBeenCalled();
  });
});
