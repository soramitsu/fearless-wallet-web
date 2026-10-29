import { JsonRpcProvider, WebSocketProvider } from 'ethers';
import {
  EvmApiHandler,
  getEvmAutoRpcUrls,
  getEvmChainId,
  getEvmRpcUrl,
  isClosedSocketProvider,
} from '@extension-base/services/network-service/handlers/EvmApiHandler';
import type { EvmApiProps } from '@extension-base/background/types/types';
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

const BLAST = 'https://optimism-mainnet.blastapi.io/';
const OP_PUBLIC = 'https://optimism.publicnode.com/';

// OP Mainnet as 4.2.2 saw it: Blast first, which every profile then saved as the current node, and which stopped
// answering in October 2026 ("Blast API is no longer available").
function opMainnet(overrides: Partial<NetworkJson> = {}) {
  return {
    name: 'OP Mainnet',
    chainId: '10',
    currentProvider: BLAST,
    customNodes: [],
    nodes: [
      { name: 'Blast https node', url: BLAST },
      { name: 'Blast wss node', url: 'wss://optimism-mainnet.blastapi.io/' },
      { name: 'Public http node', url: OP_PUBLIC },
      { name: 'Public wss node', url: 'wss://optimism.publicnode.com/' },
    ],
    ...overrides,
  } as NetworkJson;
}

const urlOf = (props?: EvmApiProps) => (props?.api as JsonRpcProvider | undefined)?._getConnection().url;

describe('EVM providers', () => {
  it('reaches a WebSocket node over HTTPS on the same host, because ethers never reopens a socket the node closed', () => {
    expect(getEvmRpcUrl(ethereum())).toBe('https://ethereum.publicnode.com');
  });

  it('walks the registry nodes on automatic selection, whatever node an older registry left saved as current', () => {
    const network = ethereum({ currentProvider: 'https://nodes.mewapi.io/rpc/eth' });

    expect(getEvmAutoRpcUrls(network)).toEqual(['https://ethereum.publicnode.com', 'https://nodes.mewapi.io/rpc/eth']);
    expect(getEvmRpcUrl(network)).toBe('https://ethereum.publicnode.com');
    expect(getEvmRpcUrl(network, 1)).toBe('https://nodes.mewapi.io/rpc/eth');
    expect(getEvmRpcUrl(network, 2)).toBe('https://ethereum.publicnode.com');
    // Once the registry drops the dead node, a profile that saved it starts on a live one.
    expect(getEvmRpcUrl(opMainnet({ nodes: opMainnet().nodes.slice(2) }))).toBe(OP_PUBLIC);
  });

  it('uses the node the user chose, theirs or the registry one, until the registry drops it', () => {
    const custom = { name: 'Own node', url: 'https://rpc.example.org/' };

    expect(getEvmRpcUrl(ethereum({ isManual: true, currentProvider: 'https://nodes.mewapi.io/rpc/eth' }))).toBe(
      'https://nodes.mewapi.io/rpc/eth'
    );
    expect(getEvmRpcUrl(ethereum({ isManual: true, currentProvider: 'wss://ethereum.publicnode.com' }))).toBe(
      'https://ethereum.publicnode.com'
    );
    expect(getEvmRpcUrl(ethereum({ isManual: true, currentProvider: custom.url, customNodes: [custom] }), 1)).toBe(custom.url);
    expect(getEvmRpcUrl(opMainnet({ isManual: true, nodes: opMainnet().nodes.slice(2) }))).toBe(OP_PUBLIC);
  });

  it('keeps a WebSocket node whose host offers no HTTPS endpoint', () => {
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

  describe('when a node fails', () => {
    it('moves an automatically selected network to its next node once per outage, and comes round again', () => {
      const handler = new EvmApiHandler({ 'OP Mainnet': opMainnet() });
      handler.initEvmApi(opMainnet());
      const blast = handler.api['op mainnet'];
      expect(urlOf(blast)).toBe(BLAST);

      const next = handler.failover('OP Mainnet', blast.api);

      expect(urlOf(next)).toBe(OP_PUBLIC);
      expect(handler.api['op mainnet']).toBe(next);
      expect(blast.api!.destroyed).toBe(true);
      // The other requests that were in flight on Blast fail too. They retry on the new node and move nothing.
      expect(handler.failover('op mainnet', blast.api)).toBe(next);
      // A rebuild for another reason stays on the node the network moved to.
      handler.rebuildApi('OP Mainnet');
      expect(urlOf(handler.api['op mainnet'])).toBe(OP_PUBLIC);

      expect(urlOf(handler.failover('OP Mainnet', handler.api['op mainnet'].api))).toBe(BLAST);
      handler.destroyApi('OP Mainnet');
    });

    it('rebuilds a node the user chose instead of moving off it', () => {
      const network = opMainnet({ isManual: true, currentProvider: OP_PUBLIC });
      const handler = new EvmApiHandler({ 'OP Mainnet': network });
      handler.initEvmApi(network);
      const chosen = handler.api['op mainnet'];

      const rebuilt = handler.failover('OP Mainnet', chosen.api);

      expect(rebuilt).not.toBe(chosen);
      expect(urlOf(rebuilt)).toBe(OP_PUBLIC);
      handler.destroyApi('OP Mainnet');
    });

    it('builds nothing for a network switched off meanwhile', () => {
      const handler = new EvmApiHandler({ 'OP Mainnet': opMainnet() });
      handler.initEvmApi(opMainnet());
      const blast = handler.api['op mainnet'].api;

      handler.destroyApi('OP Mainnet');

      expect(handler.failover('OP Mainnet', blast)).toBeUndefined();
      expect(handler.api['op mainnet']).toBeUndefined();
    });
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

    it('does not claim the configured chain when its node cannot be verified', async () => {
      const handler = new EvmApiHandler({ Ethereum: down });

      handler.initEvmApi(down);

      expect(handler.api.ethereum.api).toBeInstanceOf(JsonRpcProvider);
      await expect(handler.api.ethereum.api!.getNetwork()).rejects.toThrow();
      handler.destroyApi('Ethereum');
    });

    it('fails a request instead of holding it', async () => {
      const handler = new EvmApiHandler({ Ethereum: down });

      handler.initEvmApi(down);

      await expect(handler.api.ethereum.api!.getFeeData()).rejects.toThrow();
      handler.destroyApi('Ethereum');
    }, 15_000);
  });

  it.each(['0x2', '0x89'])('rejects a node reporting chain %s instead of its configured Ethereum chain', async (rpcChainId) => {
    const network = ethereum();
    const handler = new EvmApiHandler({ Ethereum: network });
    handler.initEvmApi(network);
    const provider = handler.api.ethereum.api as JsonRpcProvider;
    // Exercise ethers' actual getNetwork validation with only the HTTP transport replaced.
    const send = vi.spyOn(provider, '_send').mockImplementation(async (payload) =>
      (Array.isArray(payload) ? payload : [payload]).map((request) => ({ jsonrpc: '2.0', id: request.id, result: rpcChainId }))
    );
    try {
      await expect(provider.getNetwork()).rejects.toThrow('network changed');
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ method: 'eth_chainId' }));
    } finally { handler.destroyApi('Ethereum'); }
  });

  it('checks the live chain again when a previously valid endpoint changes networks', async () => {
    const network = ethereum();
    const handler = new EvmApiHandler({ Ethereum: network });
    handler.initEvmApi(network);
    const provider = handler.api.ethereum.api as JsonRpcProvider;
    let rpcChainId = '0x1';
    const send = vi.spyOn(provider, '_send').mockImplementation(async (payload) =>
      (Array.isArray(payload) ? payload : [payload]).map((request) => ({ jsonrpc: '2.0', id: request.id, result: rpcChainId }))
    );
    try {
      await expect(provider.getNetwork()).resolves.toMatchObject({ chainId: 1n });
      rpcChainId = '0x2';
      await expect(provider.getNetwork()).rejects.toThrow('network changed');
      expect(send).toHaveBeenCalledTimes(2);
    } finally { handler.destroyApi('Ethereum'); }
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
