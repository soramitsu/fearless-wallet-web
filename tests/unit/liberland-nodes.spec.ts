import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import axios from 'axios';
import { NetworkService, productionRegistryNetwork } from '@extension-base/services/network-service';
import { withDwellirApiKey } from '@extension-base/services/network-service/nodeUrlPolicy';
import { migrateRetiredBuiltinProviders } from '@extension-base/services/network-service/retiredProviders';
import type { KeyringService } from '@extension-base/services';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { assertReviewedRpcEndpoint } from '@/cross-chain/reviewedEndpoints';

// Liberland's second node (ledger D23): Dwellir's current n.dwellir.com host, after the Liberland government's node.
const LIBERLAND = '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6';
const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const GOVERNMENT_NODE = 'wss://mainnet.liberland.org';
const DWELLIR_NODE = 'wss://liberland-rpc.n.dwellir.com';

vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  IS_PRODUCTION: true,
}));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({
  default: class {
    getAndWait = vi.fn().mockResolvedValue(undefined);
    updateAndWait = vi.fn().mockResolvedValue(undefined);
    get(_key: string, callback: (value: unknown) => void) {
      callback(undefined);
    }

    set = vi.fn();
  },
}));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({
  default: class {
    getAndWait = vi.fn().mockResolvedValue({});
    get(_key: string, callback: (value: unknown) => void) {
      callback({});
    }

    set = vi.fn();
  },
}));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

const productionRegistry = (): NetworkJson[] =>
  JSON.parse(readFileSync(resolve(__dirname, '../../remote-config/production/chains/v13/chains.json'), 'utf8'));
const liberland = () => productionRegistry().find(({ chainId }) => chainId === LIBERLAND)!;
const connectedTo = (endpoint: string) => ({ _rpcCore: { provider: { endpoint } } });

describe('Liberland nodes in the production registry', () => {
  it('lists the government node first and Dwellir\'s n.dwellir.com node second', () => {
    expect(liberland().name).toBe('Liberland');
    expect(liberland().nodes).toEqual([
      { url: GOVERNMENT_NODE, name: 'Liberland node' },
      { url: DWELLIR_NODE, name: 'Dwellir node' },
    ]);
  });

  it('keeps both nodes through the production node filter and the retired-provider repair', () => {
    const network = liberland();

    expect(productionRegistryNetwork(network, true)?.nodes.map(({ url }) => url)).toEqual([GOVERNMENT_NODE, DWELLIR_NODE]);
    expect(migrateRetiredBuiltinProviders(network)).toBe(network);

    // A saved manual choice of the new node is kept as it is, not moved to another host.
    const chosen = { ...network, isManual: true, currentProvider: DWELLIR_NODE };
    expect(migrateRetiredBuiltinProviders(chosen)).toBe(chosen);
  });

  it('loads both nodes from the remote registry in a production build, connecting to the first', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: productionRegistry() });
    const service = new NetworkService({ getAllMainAccounts: () => [] } as unknown as KeyringService, {} as State);
    await service.initNetworkMap();

    expect(service.networkMap.Liberland.nodes.map(({ url }) => url)).toEqual([GOVERNMENT_NODE, DWELLIR_NODE]);
    expect(service.networkMap.Liberland.currentProvider).toBe(GOVERNMENT_NODE);
  });

  it('sends the Dwellir key only to the Dwellir node', () => {
    expect(withDwellirApiKey(DWELLIR_NODE, 'key')).toBe(`${DWELLIR_NODE}/key`);
    expect(withDwellirApiKey(GOVERNMENT_NODE, 'key')).toBe(GOVERNMENT_NODE);
  });

  it('allows a Liberland cross-chain quote over either node, and over neither for another chain', () => {
    for (const node of [GOVERNMENT_NODE, DWELLIR_NODE, `${DWELLIR_NODE}/key`]) {
      expect(() => assertReviewedRpcEndpoint(LIBERLAND, connectedTo(node)), node).not.toThrow();
    }
    expect(() => assertReviewedRpcEndpoint(POLKADOT, connectedTo(DWELLIR_NODE))).toThrow(
      'cross_chain_rpc_endpoint_not_reviewed'
    );
  });
});
