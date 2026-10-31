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

// Exact same-provider moves in the owned production/development catalogs at 63974877.
// The chainId of these Substrate rows is their genesis hash. Do not infer hostname replacements.
const DWELLIR_MOVES = [
  { name: 'Polkadot', genesis: '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3',
    from: 'wss://api-polkadot.dwellir.com', to: 'wss://api-polkadot.n.dwellir.com' },
  { name: 'Kusama', genesis: 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe',
    from: 'wss://api-kusama.dwellir.com', to: 'wss://api-kusama.n.dwellir.com' },
  { name: 'Westend', genesis: 'e143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e',
    from: 'wss://westend-rpc.dwellir.com', to: 'wss://westend-rpc.n.dwellir.com' },
  { name: 'Kusama AssetHub', genesis: '48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a',
    from: 'wss://api-assethub-kusama.dwellir.com', to: 'wss://api-asset-hub-kusama.n.dwellir.com' },
  { name: 'Polkadot AssetHub', genesis: '68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f',
    from: 'wss://api-assethub-polkadot.dwellir.com', to: 'wss://api-asset-hub-polkadot.n.dwellir.com' },
  { name: 'Acala', genesis: 'fc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c',
    from: 'wss://acala-rpc.dwellir.com', to: 'wss://acala-rpc.n.dwellir.com' },
  { name: 'Karura', genesis: 'baf5aabe40646d11f0ee8abbdc64f4a4b7674925cba08e4a05ff9ebed6e2126b',
    from: 'wss://api-karura.dwellir.com', to: 'wss://api-karura.n.dwellir.com' },
  { name: 'Shiden', genesis: 'f1cf9022c7ebb34b162d5b5e34e705a5a740b2d0ecc1009fb89023e62a488108',
    from: 'wss://api-shiden.dwellir.com', to: 'wss://api-shiden.n.dwellir.com' },
  { name: 'Bifrost', genesis: '9f28c6a68e0fc9646eff64935684f6eeeece527e37bbe1f213d22caa1d9d6bed',
    from: 'wss://api-bifrost-kusama.dwellir.com', to: 'wss://api-bifrost-kusama.n.dwellir.com' },
  { name: 'Astar', genesis: '9eb76c5184c4ab8679d2d5d819fdf90b9c001403e9e17da2e14b6d8aec4029c6',
    from: 'wss://api-astar.dwellir.com', to: 'wss://api-astar.n.dwellir.com' },
  { name: 'Basilisk', genesis: 'a85cfb9b9fd4d622a5b28289a02347af987d8f73fa3108450e2b4a11c1ce5755',
    from: 'wss://api-basilisk.dwellir.com', to: 'wss://api-basilisk.n.dwellir.com' },
  { name: 'Kintsugi', genesis: '9af9a64e6e4da8e3073901c3ff0cc4c3aad9563786d89daf6ad820b6e14a0b8b',
    from: 'wss://api-kintsugi.dwellir.com', to: 'wss://api-kintsugi.n.dwellir.com' },
  { name: 'Centrifuge', genesis: 'b3db41421702df9a7fcac62b53ffeac85f7853cc4e689e0b93aeb3db18c09d82',
    from: 'wss://api-centrifuge.dwellir.com', to: 'wss://api-centrifuge.n.dwellir.com' },
  { name: 'Interlay', genesis: 'bf88efe70e9e0e916416e8bed61f2b45717f517d7f3523e33c7b001e5ffcbc72',
    from: 'wss://api-interlay.dwellir.com', to: 'wss://api-interlay.n.dwellir.com' },
  { name: 'NeuroWeb Parachain', genesis: 'e7e0962324a3b86c83404dbea483f25fb5dab4c224791c81b756cfc948006174',
    from: 'wss://api-neuroweb.dwellir.com', to: 'wss://api-neuroweb.n.dwellir.com' },
  { name: 'UNIQUE', genesis: '84322d9cddbf35088f1e54e9a85c967a41a56a4f43445768125e61af166c7d31',
    from: 'wss://api-unique.dwellir.com', to: 'wss://api-unique.n.dwellir.com' },
  { name: 'Bifrost Polkadot', genesis: '262e1b2ad728475fd6fe88e62d34c200abe6fd693931ddad144059b1eb884e5b',
    from: 'wss://api-bifrost-polkadot.dwellir.com', to: 'wss://api-bifrost-polkadot.n.dwellir.com' },
  { name: 'Heima', genesis: '2fc8bb6ed7c0051bdcf4866c322ed32b6276572713607e3297ccf411b8f14aa9',
    from: 'wss://api-litentry.dwellir.com', to: 'wss://api-heima.n.dwellir.com' },
  { name: 'Darwinia2', genesis: 'f0b8924b12e8108550d28870bc03f7b45a947e1b2b9abf81bfb0b89ecb60570e',
    from: 'wss://darwinia-rpc.dwellir.com', to: 'wss://api-darwinia.n.dwellir.com' },
  { name: 'Aleph Zero', genesis: '70255b4d28de0fc4e1a193d7e175ad1ccef431598211c55538f1018651a0344e',
    from: 'wss://api-aleph-zero-mainnet.dwellir.com', to: 'wss://api-aleph-zero-mainnet.n.dwellir.com' },
  { name: 'Kusama BridgeHub', genesis: '00dcb981df86429de8bbacf9803401f09485366c44efbf53af9ecfab03adc7e5',
    from: 'wss://api-kusama-bridge-hub.dwellir.com', to: 'wss://api-bridge-hub-kusama.n.dwellir.com' },
  { name: 'Frequency', genesis: '4a587bf17a404e3572747add7aab7bbe56e805a5479c6c436f07f36fcc8d3ae1',
    from: 'wss://api-frequency.dwellir.com', to: 'wss://api-frequency.n.dwellir.com' },
  { name: 'Pendulum', genesis: '5d3c298622d5634ed019bf61ea4b71655030015bde9beb0d6a24743714462c86',
    from: 'wss://api-pendulum.dwellir.com', to: 'wss://api-pendulum.n.dwellir.com' },
  { name: 'XX network', genesis: '50dd5d206917bf10502c68fb4d18a59fc8aa31586f4e8856b493e43544aa82aa',
    from: 'wss://xxnetwork-rpc.dwellir.com', to: 'wss://xxnetwork-rpc.n.dwellir.com' },
  { name: 'Polkadot BridgeHub', genesis: 'dcf691b5a3fbe24adc99ddc959c0561b973e329b1aef4c4b22e7bb2ddecb4464',
    from: 'wss://api-polkadot-bridge-hub.dwellir.com', to: 'wss://api-bridge-hub-polkadot.n.dwellir.com' },
  { name: 'Litentry', genesis: '2fc8bb6ed7c0051bdcf4866c322ed32b6276572713607e3297ccf411b8f14aa9',
    from: 'wss://api-litentry.dwellir.com', to: 'wss://api-heima.n.dwellir.com' },
] as const;

/** Repair saved manual built-in choices only when the current catalog includes the verified replacement. */
export function migrateRetiredDwellirProvider(network: NetworkJson): NetworkJson {
  if (network.ecosystem !== 'substrate' || network.isManual !== true) return network;

  const selected = network.currentProvider;
  const move = DWELLIR_MOVES.find(({ name, genesis, from }) => network.name === name &&
    network.chainId.toLowerCase() === genesis && selected === from);
  if (!move || (network.genesisHash && network.genesisHash.toLowerCase() !== `0x${move.genesis}`)) return network;
  if (!network.nodes.some(({ url }) => url === move.to)) return network;
  if (network.customNodes?.some(({ url }) => url === selected) ||
    Object.values(network.customProviders ?? {}).includes(selected)) return network;

  return { ...network, currentProvider: move.to };
}

export function migrateRetiredBuiltinProviders(network: NetworkJson): NetworkJson {
  return migrateRetiredDwellirProvider(migrateRetiredOpProvider(network));
}
