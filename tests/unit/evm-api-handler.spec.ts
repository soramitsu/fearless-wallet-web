import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import {
  EvmApiHandler,
  getEvmChainId,
  getEvmRpcUrl,
  isClosedSocketProvider,
} from '@extension-base/services/network-service/handlers/EvmApiHandler';
import type { NetworkJson } from '@extension-base/types';

// The Ethereum entry of the published chain list: a WebSocket node first, the same host over HTTPS second.
function ethereum(overrides: Partial<NetworkJson> = {}) {
  return {
    name: 'Ethereum',
    chainId: '1',
    currentProvider: 'wss://ethereum.publicnode.com',
    customNodes: [],
    nodes: [
      { name: 'Public wss', url: 'wss://ethereum.publicnode.com' },
      { name: 'Public https', url: 'https://ethereum.publicnode.com' },
      { name: 'MEW https', url: 'https://nodes.mewapi.io/rpc/eth' },
    ],
    ...overrides,
  } as NetworkJson;
}

// ethers accepts any WebSocket-like object, so no connection is opened. 1 is OPEN, 2 CLOSING, 3 CLOSED.
function socket(readyState: number) {
  return { readyState, send: vi.fn(), close: vi.fn(), onopen: null, onmessage: null, onerror: null };
}

const socketProvider = (readyState: number) => new WebSocketProvider(socket(readyState) as never, 1);

describe('EVM providers', () => {
  it('reaches a WebSocket node over HTTPS on the same host, because ethers never reopens a socket the node closed', () => {
    expect(getEvmRpcUrl(ethereum())).toBe('https://ethereum.publicnode.com');
  });

  it('keeps an HTTPS node, and a WebSocket node whose host offers no HTTPS endpoint', () => {
    expect(getEvmRpcUrl(ethereum({ currentProvider: 'https://nodes.mewapi.io/rpc/eth' }))).toBe(
      'https://nodes.mewapi.io/rpc/eth'
    );
    expect(
      getEvmRpcUrl(
        ethereum({
          nodes: [
            { name: 'Only wss', url: 'wss://ethereum.publicnode.com' },
            { name: 'Elsewhere', url: 'https://nodes.mewapi.io/rpc/eth' },
          ],
        })
      )
    ).toBe('wss://ethereum.publicnode.com');
  });

  it('reads a chain id in decimal or hex, and none from a genesis hash', () => {
    expect(getEvmChainId(ethereum())).toBe(1n);
    expect(getEvmChainId(ethereum({ chainId: '0x38' }))).toBe(56n);
    expect(
      getEvmChainId(ethereum({ chainId: '401a1f9dca3da46f5c4091016c8a2f26dcea05865116b286f60f668207d1474b' }))
    ).toBeUndefined();
  });

  describe('with a node that is down', () => {
    // Nothing listens on the discard port, so nothing here can reach a real node.
    const down = ethereum({ currentProvider: 'http://127.0.0.1:9', nodes: [{ name: 'Down', url: 'http://127.0.0.1:9' }] });

    it('knows the configured chain without asking the node', async () => {
      const handler = new EvmApiHandler({ Ethereum: down });

      handler.initEvmApi(down);

      expect(handler.api.ethereum.api).toBeInstanceOf(JsonRpcProvider);
      await expect(handler.api.ethereum.api!.getNetwork()).resolves.toMatchObject({ chainId: 1n });
      handler.destroyApi('Ethereum');
    });

    it('fails a request instead of holding it', async () => {
      const handler = new EvmApiHandler({ Ethereum: down });

      handler.initEvmApi(down);

      await expect(handler.api.ethereum.api!.getFeeData()).rejects.toThrow();
      handler.destroyApi('Ethereum');
    }, 15_000);
  });

  it('treats a closing, closed or destroyed socket as closed, and an open one or HTTPS as live', async () => {
    const destroyed = socketProvider(1);

    await destroyed.destroy();

    expect(isClosedSocketProvider(socketProvider(1))).toBe(false);
    expect(isClosedSocketProvider(socketProvider(2))).toBe(true);
    expect(isClosedSocketProvider(socketProvider(3))).toBe(true);
    expect(isClosedSocketProvider(destroyed)).toBe(true);
    expect(isClosedSocketProvider(new JsonRpcProvider('https://ethereum.publicnode.com', 1, { staticNetwork: true }))).toBe(false);
    expect(isClosedSocketProvider(undefined)).toBe(false);
  });

  it('rebuilds a provider whose socket the node closed before handing it out', () => {
    const handler = new EvmApiHandler({ Ethereum: ethereum() });
    const closed = socket(3);

    handler.api.ethereum = { api: new WebSocketProvider(closed as never, 1), timeout: {} };

    expect(handler.getApi('Ethereum')?.api).toBeInstanceOf(JsonRpcProvider);
    expect(closed.close).toHaveBeenCalled();
    handler.destroyApi('Ethereum');
  });

  it('hands out a live provider as it is, whatever the letter case of the name', () => {
    const handler = new EvmApiHandler({ Ethereum: ethereum() });
    const live = socketProvider(1);

    handler.api.ethereum = { api: live, timeout: {} };

    expect(handler.getApi('ethereum')?.api).toBe(live);
    expect(handler.getApi('Ethereum')?.api).toBe(live);
    expect(handler.getApi('Polygon')).toBeUndefined();
  });

  it('recovers only the providers whose socket closed, leaving live ones and their requests alone', () => {
    const polygon = ethereum({
      name: 'Polygon',
      chainId: '137',
      currentProvider: 'https://polygon-bor-rpc.publicnode.com',
      nodes: [{ name: 'Bor public https', url: 'https://polygon-bor-rpc.publicnode.com' }],
    });
    const handler = new EvmApiHandler({ Ethereum: ethereum(), Polygon: polygon });
    const live = socketProvider(1);
    const http = new JsonRpcProvider('https://polygon-bor-rpc.publicnode.com', 137, { staticNetwork: true });

    handler.api.ethereum = { api: socketProvider(2), timeout: {} };
    handler.api.polygon = { api: http, timeout: {} };
    handler.api.moonbeam = { api: live, timeout: {} };

    handler.recoverClosedApis();

    expect(handler.api.ethereum.api).toBeInstanceOf(JsonRpcProvider);
    expect(handler.api.polygon.api).toBe(http);
    expect(handler.api.moonbeam.api).toBe(live);
    handler.destroyApi('Ethereum');
    handler.destroyApi('Polygon');
  });
});
