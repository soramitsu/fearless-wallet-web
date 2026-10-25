import { JsonRpcProvider, Network, WebSocketProvider } from 'ethers';
import { getEvmApiKey } from '@extension-base/const/networks';
import { getCurrentProvider } from '@extension-base/utils';
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
 * The node a network's EVM calls go to. A WebSocket node is swapped for the same host's HTTP endpoint when the network
 * lists one: public nodes close a socket after a minute without traffic, ethers never reopens it, and every request
 * written to it afterwards waits forever.
 */
export function getEvmRpcUrl(network: NetworkJson): string | undefined {
  const url = getCurrentProvider(network);

  if (!url || isHttpUrl(url)) return url;

  const host = getHost(url);
  const nodes = [...(network.nodes ?? []), ...(network.customNodes ?? [])];

  return nodes.find((node) => isHttpUrl(node.url) && getHost(node.url) === host)?.url ?? url;
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

  initEvmApi(network: NetworkJson) {
    if (network === undefined) return;

    const { name } = network;
    const currentProvider = getEvmRpcUrl(network);

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
