import { describe, expect, it, vi } from 'vitest';
import { EipService } from '@extension-base/services/eip-service';
import type State from '@extension-base/background/handlers/State';

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

  return { service: new EipService(state as unknown as State), send, api };
}

describe('EIP service RPC request settlement', () => {
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
