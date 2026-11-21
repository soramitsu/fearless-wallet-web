import axios from 'axios';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import productionRegistry from '../../remote-config/production/chains/v13/chains.json';
import legacyRegistry from '../fixtures/legacy-305/chains-v13.snapshot.json';
import type { NetworkJson } from '@extension-base/types';

const io = vi.hoisted(() => ({
  stored: {} as Record<string, NetworkJson>, write: vi.fn(), queue: Promise.resolve() as Promise<unknown>,
  init: vi.fn(), service: null as unknown as { upsertNetworkMap: (n: unknown, e?: unknown) => Promise<void> },
  network: null as unknown as NetworkJson,
}));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  getSubject() { return { next() {} }; }
  getAndWait() { return Promise.resolve(structuredClone(io.stored)); }
  updateAndWait(key: string, transform: (current: unknown) => Record<string, NetworkJson>, publish?: (value: unknown) => void) {
    const operation = io.queue.then(async () => {
      const value = transform(structuredClone(io.stored));
      await io.write(key, value);
      io.stored = structuredClone(value);
      publish?.(value);
      return value;
    });
    io.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class { get(_k: string, update: (v: unknown) => void) { update({}); } } }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {
  api = {};
  initApi(network: NetworkJson) { io.init(JSON.parse(JSON.stringify(network))); return Promise.resolve(); }
} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));
// The screen's message, delivered to the real worker service.
vi.mock('@/extension/messaging', async () => {
  const { nodePreferences } = await vi.importActual<typeof import('@extension-base/services/network-service/preferences')>(
    '@extension-base/services/network-service/preferences');
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  return { upsertNetworkMap: (data: NetworkJson, previous?: NetworkJson) =>
    io.service.upsertNetworkMap(clone(data), previous ? clone(nodePreferences(previous)) : undefined) };
});
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork: () => io.network }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: { address: 'owner' } }) }));
vi.mock('@/util/BaseApi', () => ({ default: { formatAddress: () => '' } }));
vi.mock('@/helpers', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), cut: (v: string) => v, setClipboard: vi.fn() }));

import Nodes from '@/screens/accounts/Nodes.vue';

const OLD = 'wss://api-polkadot.dwellir.com';
const row = (list: unknown[]) => structuredClone((list as NetworkJson[]).find(({ name }) => name === 'Polkadot')!);

async function openNodes(saved: Partial<NetworkJson>) {
  const legacy = row(legacyRegistry as unknown[]);
  io.stored = { Polkadot: { ...legacy, genesisHash: `0x${legacy.chainId}`, customNodes: [], customProviders: {}, favorite: [], ...saved } as NetworkJson };
  vi.mocked(axios.get).mockResolvedValue({ data: [row(productionRegistry as unknown[])] });
  const service = new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);
  io.service = service as never;
  await service.initNetworkMap(); await io.queue;
  io.init.mockClear();
  io.network = reactive(JSON.parse(JSON.stringify(service.networkMap.Polkadot)));
  const wrapper = mount(Nodes, { global: {
    stubs: {
      ContentForm: { template: '<div><slot /></div>' }, ExternalLogo: true, Icon: true, Tooltip: true, FButton: true,
      Switcher: { props: ['disabled', 'value'], template: '<button data-testid="auto" :aria-checked="value" @click="$emit(\'change\', !value)">Auto</button>' },
      NodeItem: { props: ['url', 'isActive'], template: '<div class="node" :data-url="url" :data-active="isActive">{{ url }}</div>' },
    },
    mocks: { $t: (k: string) => k, $route: { name: 'Nodes', params: { network: 'Polkadot' } } },
  } });
  const turnAutoOff = async () => {
    expect(wrapper.get('[data-testid="auto"]').attributes('aria-checked')).toBe('true');
    await wrapper.get('[data-testid="auto"]').trigger('click');
    await flushPromises(); await io.queue; await flushPromises();
    Object.assign(io.network, JSON.parse(JSON.stringify(service.networkMap.Polkadot))); // the networkMap subscription
    await flushPromises();
  };
  const highlighted = () => wrapper.findAll('.node').filter((node) => node.attributes('data-active') === 'true').map((node) => node.attributes('data-url'));
  return { service, wrapper, turnAutoOff, highlighted };
}

describe('Nodes: turning automatic node selection off', () => {
  it('pins the node the screen then shows, not the retired host saved at install', async () => {
    // A wallet first opened with the 3.0.x catalog saved nodes[0] (Dwellir) as its provider in automatic mode.
    expect(row(legacyRegistry as unknown[]).nodes[0].url).toBe(OLD);
    const { service, wrapper, turnAutoOff, highlighted } = await openNodes({ currentProvider: OLD });
    const first = service.networkMap.Polkadot.nodes[0].url;
    expect(service.networkMap.Polkadot.nodes.some(({ url }) => url === OLD)).toBe(false);

    await turnAutoOff();

    const committed = service.networkMap.Polkadot;
    expect(committed.isManual).toBe(true);
    expect(committed.currentProvider).toBe(first);
    expect((io.init.mock.calls.at(-1)?.[0] as NetworkJson).currentProvider).toBe(first);
    expect(highlighted()).toEqual([first]);
    wrapper.unmount();
  });

  it('pins the first node automatic selection uses even when the saved provider is still listed', async () => {
    const listed = row(productionRegistry as unknown[]).nodes[1].url;
    const { service, wrapper, turnAutoOff, highlighted } = await openNodes({ currentProvider: listed });
    const first = service.networkMap.Polkadot.nodes[0].url;
    expect(first).not.toBe(listed);

    await turnAutoOff();

    expect(service.networkMap.Polkadot.currentProvider).toBe(first);
    expect(highlighted()).toEqual([first]);
    wrapper.unmount();
  });
});
