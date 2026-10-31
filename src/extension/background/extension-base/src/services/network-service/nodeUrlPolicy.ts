import type { NetworkJson } from '@extension-base/types';

/** Networks the wallet reaches through polkadot-js, whose node URLs are WebSocket RPC endpoints. */
const SUBSTRATE_RPC_ECOSYSTEMS: ReadonlySet<string> = new Set(['substrate', 'ethereumBased']);

function parse(url: unknown): URL | undefined {
  if (typeof url !== 'string') return undefined;

  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

/**
 * Whether a production build connects to a node URL taken from the remote registry. Substrate RPC must use wss://;
 * the HTTP and WebSocket RPC of the other ecosystems must use TLS as well (https:// or wss://). A URL with credentials
 * is refused. Development and test builds read the development registry and are not filtered.
 */
export function isAcceptedRegistryNodeUrl(ecosystem: string, url: unknown): boolean {
  const parsed = parse(url);
  if (!parsed || parsed.username || parsed.password) return false;

  return SUBSTRATE_RPC_ECOSYSTEMS.has(ecosystem)
    ? parsed.protocol === 'wss:'
    : parsed.protocol === 'wss:' || parsed.protocol === 'https:';
}

/**
 * The registry row with only the nodes a production build accepts, or undefined when none is left. A row without
 * nodes (Bitcoin, Solana and Iroha reach their own services) is kept as it is.
 */
export function withAcceptedRegistryNodes<T extends Pick<NetworkJson, 'ecosystem' | 'nodes'>>(network: T): T | undefined {
  if (!network.nodes.length) return network;

  const nodes = network.nodes.filter(({ url }) => isAcceptedRegistryNodeUrl(network.ecosystem, url));
  if (!nodes.length) return undefined;

  return nodes.length === network.nodes.length ? network : { ...network, nodes };
}

/**
 * Dwellir endpoints take the API key as the last path segment. The key goes only to Dwellir's own hosts (dwellir.com
 * and its subdomains), never to another host whose URL merely mentions it; an unreadable URL gets no key.
 */
export function withDwellirApiKey(endpoint: string, apiKey: string): string {
  const host = parse(endpoint)?.hostname.toLowerCase();

  return host === 'dwellir.com' || host?.endsWith('.dwellir.com') ? `${endpoint}/${apiKey}` : endpoint;
}
