import type { NetworkJson } from '@extension-base/types';

export const OP_MAINNET_RPC_URL = 'https://optimism.publicnode.com/';

const isRetiredOpProvider = (url: string) => /^(?:https|wss):\/\/optimism-mainnet\.blastapi\.io\/?$/i.test(url);

/** Replace only OP's retired built-in nodes, including preferences restored from an older registry/cache. */
export function migrateRetiredOpProvider(network: NetworkJson): NetworkJson {
  if (network.name !== 'OP Mainnet' || network.ecosystem !== 'ethereum' ||
    !['10', '0xa'].includes(network.chainId.toLowerCase())) return network;

  const retiredSelection = isRetiredOpProvider(network.currentProvider ?? '');
  const customSelection = network.customNodes?.some(({ url }) => url === network.currentProvider) ||
    Object.values(network.customProviders ?? {}).includes(network.currentProvider);
  // A user-supplied endpoint is not an app-owned preference, even if its URL matches the old default.
  if (retiredSelection && customSelection) return network;
  if (!retiredSelection && !network.nodes.some(({ url }) => isRetiredOpProvider(url))) return network;

  const nodes = network.nodes.filter(({ url }) => !isRetiredOpProvider(url));
  if (!nodes.some(({ url }) => url === OP_MAINNET_RPC_URL)) {
    nodes.unshift({ name: 'Public http node', url: OP_MAINNET_RPC_URL });
  }

  return {
    ...network,
    nodes,
    providers: Object.fromEntries(nodes.map(({ name, url }) => [name, url])),
    currentProvider: retiredSelection ? OP_MAINNET_RPC_URL : network.currentProvider,
  };
}
