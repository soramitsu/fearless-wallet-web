import { JsonRpcProvider, Network, WebSocketProvider } from 'ethers';
import { getEvmApiKey } from '@extension-base/const/networks';
import type { NetworkMap } from '..';
import type { EvmApiProps } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { isSameString } from '@/helpers';

// WebSocket.CLOSING; the constant is spelled out because the global is not there in every runtime this code is tested in.
const WEBSOCKET_CLOSING = 2;

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

function getHost(url: string) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * A WebSocket node is swapped for the same host's HTTP endpoint when `nodes` lists one: public nodes close a socket
 * after a minute without traffic, ethers never reopens it, and every request written to it afterwards waits forever.
 */
function overHttp(url: string, nodes: NetworkJson['nodes']): string {
  if (isHttpUrl(url)) return url;

  const host = getHost(url);

  return nodes.find((node) => isHttpUrl(node.url) && getHost(node.url) === host)?.url ?? url;
}

/**
 * The node the user picked with automatic selection off, among the network's nodes or their own. A node the registry
 * has since dropped is no longer a choice, and selection goes back to automatic.
 */
export function getEvmManualRpcUrl(network: NetworkJson): string | undefined {
  if (!network.isManual || !network.currentProvider) return undefined;

  const nodes = [...(network.nodes ?? []), ...(network.customNodes ?? [])];

  return nodes.some(({ url }) => url === network.currentProvider) ? overHttp(network.currentProvider, nodes) : undefined;
}

/**
 * The nodes automatic selection goes through, in the registry's order. The node saved as current is not one of them:
 * it is whatever node was first in the registry when the wallet first loaded it, and it stays saved after that node
 * dies (Blast API, OP Mainnet's first node, stopped answering in October 2026).
 */
export function getEvmAutoRpcUrls(network: NetworkJson): string[] {
  const nodes = network.nodes ?? [];

  return [...new Set(nodes.map(({ url }) => overHttp(url, nodes)))];
}

/** The node a network's EVM calls go to: the one the user chose, or the automatic one after `failovers` moves. */
export function getEvmRpcUrl(network: NetworkJson, failovers = 0): string | undefined {
  const urls = getEvmAutoRpcUrls(network);

  return getEvmManualRpcUrl(network) ?? urls[failovers % urls.length];
}

/**
 * The configured chain id is the expected chain, not evidence of the node's actual identity.
 * Providers retain live network detection so signing guards reject nodes serving another chain.
 */
export function getEvmChainId(network: NetworkJson): bigint | undefined {
  const chainId = String(network.chainId ?? '').trim();

  return /^(\d+|0x[\da-f]+)$/i.test(chainId) ? BigInt(chainId) : undefined;
}

/** A provider whose socket has closed. ethers neither reconnects it nor fails the requests written to it. */
export function isClosedSocketProvider(api: EvmApiProps['api']): boolean {
  if (!(api instanceof WebSocketProvider)) return false;

  try {
    return api.websocket.readyState >= WEBSOCKET_CLOSING;
  } catch {
    // ethers throws here once the provider has been destroyed.
    return true;
  }
}

export class EvmApiHandler {
  api: Record<string, EvmApiProps> = {};
  /** How often each network (by lower-case name) moved on from a failed automatic node. Survives provider rebuilds. */
  private readonly failovers: Record<string, number> = {};

  constructor(readonly networkMap: NetworkMap) {}

  /** The provider of a network, rebuilt first when the node has closed its socket. */
  getApi(network: string): EvmApiProps | undefined {
    const key = network.toLowerCase();

    if (isClosedSocketProvider(this.api[key]?.api)) this.rebuildApi(network);

    return this.api[key];
  }

  refreshEvmApi(network: string) {
    this.initEvmApi(this.networkMap[network]);
  }

  /** Replaces the provider of a network, found by name in any letter case. */
  rebuildApi(network: string) {
    const networkJson = this.findNetwork(network);

    if (networkJson) this.initEvmApi(networkJson);
  }

  /** Rebuilds only the providers whose socket closed: rebuilding a live one would strand the requests it is serving. */
  recoverClosedApis() {
    Object.entries(this.api).forEach(([key, { api }]) => {
      if (isClosedSocketProvider(api)) this.rebuildApi(key);
    });
  }

  /**
   * Replaces `failed`, the provider of a network whose node stopped answering. With automatic selection the network
   * moves on to its next node; a node the user chose is rebuilt in place. Every request in flight on a dead node fails:
   * the first replaces the provider and the others find it replaced, so one outage moves the network on once. Returns
   * the provider to retry on, or nothing when the network was switched off meanwhile.
   */
  failover(network: string, failed: EvmApiProps['api']): EvmApiProps | undefined {
    const key = network.toLowerCase();
    const current = this.api[key];

    if (!current?.api) return undefined;
    if (current.api !== failed) return current;

    const networkJson = this.findNetwork(network);

    if (!networkJson) return current;
    if (!getEvmManualRpcUrl(networkJson)) this.failovers[key] = (this.failovers[key] ?? 0) + 1;

    this.initEvmApi(networkJson);

    return this.api[key];
  }

  initEvmApi(network: NetworkJson) {
    if (network === undefined) return;

    const { name } = network;
    const currentProvider = getEvmRpcUrl(network, this.failovers[name.toLowerCase()]);

    this.destroyApi(network.name);

    if (currentProvider) this.api[name.toLowerCase()] = this.createEvmProvider(currentProvider, getEvmChainId(network));
  }

  private findNetwork(name: string): NetworkJson | undefined {
    return this.networkMap[name] ?? Object.values(this.networkMap).find((network) => isSameString(network.name, name));
  }

  private createEvmProvider(url: string, chainId?: bigint): EvmApiProps {
    const apiKey = getEvmApiKey(url);
    const providerUrl = `${url}${apiKey ?? ''}`;
    const network = chainId === undefined ? undefined : Network.from(chainId);

    const api = url.startsWith('http')
      ? new JsonRpcProvider(providerUrl, network, {
          batchStallTime: 10,
          batchMaxCount: 30,
        })
      : new WebSocketProvider(providerUrl, network);

    return {
      api,
      timeout: {},
    };
  }

  destroyApi(network: string) {
    const networkLower = network.toLowerCase();

    this.api[networkLower]?.api?.destroy();

    delete this.api[networkLower];
  }
}
