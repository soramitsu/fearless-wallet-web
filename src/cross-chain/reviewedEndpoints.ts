import { REVIEWED_CHAIN_IDS } from '@/cross-chain/reviewedRoutes';

const chain = REVIEWED_CHAIN_IDS;

/**
 * RPC hosts a cross-chain quote may use, per chain: the chains of the reviewed runtime table and the destinations of
 * the bundled routes, each with the hosts of its production registry `nodes` as of 4.2.3 (Dwellir's `n.dwellir.com`
 * hosts, no Blast API).
 *
 * The remote registry chooses which node the wallet connects to, and that node supplies the metadata that encodes the
 * call, the balances and nonce, the dry run, the destination's existential deposit and the transaction status. A
 * quote is therefore refused on any other host (including a custom node), until a release adds it here.
 */
export const REVIEWED_RPC_HOSTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [chain.polkadot]: Object.freeze([
    'api-polkadot.n.dwellir.com',
    'rpc.polkadot.io',
    'rpc-polkadot.luckyfriday.io',
    'polkadot.public.curie.radiumblock.co',
  ]),
  [chain.kusama]: Object.freeze([
    'api-kusama.n.dwellir.com',
    'kusama-rpc.polkadot.io',
    'rpc-kusama.luckyfriday.io',
    'kusama.public.curie.radiumblock.co',
  ]),
  [chain.polkadotAssetHub]: Object.freeze([
    'api-asset-hub-polkadot.n.dwellir.com',
    'polkadot-asset-hub-rpc.polkadot.io',
    'statemint.public.curie.radiumblock.co',
    'rpc-asset-hub-polkadot.luckyfriday.io',
    'dot-rpc.stakeworld.io',
  ]),
  [chain.kusamaAssetHub]: Object.freeze([
    'api-asset-hub-kusama.n.dwellir.com',
    'kusama-asset-hub-rpc.polkadot.io',
    'statemine.public.curie.radiumblock.co',
    'rpc-asset-hub-kusama.luckyfriday.io',
    'ksm-rpc.stakeworld.io',
  ]),
  [chain.liberland]: Object.freeze(['mainnet.liberland.org']),
  [chain.sora]: Object.freeze(['ws.mof.sora.org', 'mof2.sora.org', 'mof3.sora.org']),
  [chain.acala]: Object.freeze([
    'acala-rpc.n.dwellir.com',
    'acala-rpc-0.aca-api.network',
    'acala-rpc-1.aca-api.network',
    'acala-rpc-3.aca-api.network',
    'acala.ibp.network',
    'acala.dotters.network',
  ]),
  [chain.astar]: Object.freeze([
    'api-astar.n.dwellir.com',
    'rpc.astar.network',
    'astar.public.curie.radiumblock.co',
  ]),
});

/** The endpoint a polkadot-js API talks to. polkadot-js keeps its provider on the protected `_rpcCore`. */
export function connectedRpcEndpoint(api: unknown): string | undefined {
  const endpoint = (api as { _rpcCore?: { provider?: { endpoint?: unknown } } } | null | undefined)?._rpcCore?.provider
    ?.endpoint;

  return typeof endpoint === 'string' ? endpoint : undefined;
}

/** Throws unless the API is connected over wss:// to a reviewed host of that chain, on the default port. */
export function assertReviewedRpcEndpoint(
  chainId: string,
  api: unknown,
  hosts: Readonly<Record<string, readonly string[]>> = REVIEWED_RPC_HOSTS
): void {
  let endpoint: URL | undefined;
  try {
    endpoint = new URL(connectedRpcEndpoint(api) ?? '');
  } catch {
    endpoint = undefined;
  }

  if (
    !endpoint ||
    endpoint.protocol !== 'wss:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    !hosts[chainId]?.includes(endpoint.hostname.toLowerCase())
  ) {
    throw new Error('cross_chain_rpc_endpoint_not_reviewed');
  }
}
