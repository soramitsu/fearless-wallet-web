import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { APIItemState } from '@extension-base/api/types/networks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';

const DAI = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';
const DOT = '887a17c7-1370-4de0-97dd-5422e294fa75';
const ASSET_HUB_USDT = 'ea33432f-9bd9-4d42-93bc-cd45a0e8a44c';

const mocks = vi.hoisted(() => ({
  balances: [] as unknown[],
  networks: [] as unknown[],
  checkTransfer: vi.fn(),
}));

vi.mock('@/extension/messaging', () => ({
  checkTransfer: mocks.checkTransfer,
  checkCrossChain: vi.fn(),
  checkScamAddress: vi.fn(async () => ({ value: false, info: null })),
}));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({
    get networks() {
      return mocks.networks;
    },
    get allNetworks() {
      return mocks.networks;
    },
    getNetwork: (nameOrChainId: string) =>
      (mocks.networks as NetworkJson[]).find(
        ({ name, chainId }) =>
          name.toLowerCase() === nameOrChainId?.toLowerCase() || chainId === nameOrChainId
      ),
    getAssetPrice: () => ({ price: 1, priceChange: 0, isExist: true }),
  }),
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    get balances() {
      return mocks.balances;
    },
    selectedWallet: { address: 'wallet-address', ethereumAddress: '0xwallet', name: 'Test wallet' },
    selectedNetwork: 'all',
    accounts: [],
    acountsEcosystem: [],
    fiatSymbol: '$',
  }),
}));
vi.mock('@/util/BaseApi', () => ({
  default: {
    formatAddress: ({ address }: { address?: string }) => address ?? '',
    isBitcoinNetwork: () => false,
    isEthereumNetwork: (name: string) => ['polygon', 'arbitrum one', 'op mainnet'].includes(name.toLowerCase()),
    isSameAddress: () => false,
    isSolanaNetwork: () => false,
    validateAddress: () => false,
    validateAddressByNetwork: () => true,
  },
}));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false }));
vi.mock('@/screens/main/WalletInfo.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/HistoryBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/EditAddressBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/ConfirmationPasswordPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/ExistentialPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/WarningAddressPopup.vue', () => ({ default: { template: '<div />' } }));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';
import { parseTransferAssetOptionValue } from '@/helpers/currencies';

const network = (
  name: string,
  rank: number,
  utilityId: string,
  ecosystem = 'substrate',
  active = true,
  registry?: { chainId: string; assets: { id: string; symbol: string; precision: number }[] }
): NetworkJson =>
  ({
    name,
    chainId: registry?.chainId ?? `${name.toLowerCase()}-chain`,
    active,
    ecosystem,
    rank,
    assets: registry?.assets ?? [{ id: utilityId }],
    favorite: [],
  }) as unknown as NetworkJson;

// Registry chain ids and assets exactly as the reviewed snapshot (and so the bundled token groups) has them.
const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const POLKADOT_ASSET_HUB = '68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f';
const POLKADOT_PEOPLE = '67fa177a097bfa18f77ea95ab56e9bcdfeb0e5b8a40e46298bb93e16b6fc5008';
const PEOPLE_DOT = 'bb56f037-6f96-45e6-9b3c-c9059bf0f731';
const ETHEREUM_USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const AVALANCHE_USDT = '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7';
const POLYGON_USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const dot = (id = DOT) => ({ id, symbol: 'dot', precision: 10 });

const group = ({
  id,
  networkName,
  symbol,
  total,
  isUtility = false,
  currencyId,
  relayChain,
}: {
  id: string;
  networkName: string;
  symbol: string;
  total: string;
  isUtility?: boolean;
  currencyId?: string;
  relayChain: string;
}): TokenGroup =>
  ({
    groupId: id,
    mainNetwork: networkName,
    priceId: symbol,
    symbol,
    tokenName: symbol.toUpperCase(),
    relayChain,
    icon: `${symbol}-icon`,
    providers: [],
    balances: [
      {
        state: APIItemState.READY,
        name: networkName.toLowerCase(),
        id,
        currencyId,
        symbol,
        priceId: symbol,
        precision: 18,
        type: 'normal',
        icon: `${networkName}-icon`,
        isUtility,
        total,
        transferable: total,
      } as BalanceItem,
    ],
  }) as TokenGroup;

const Host = defineComponent({
  components: { TransferForm },
  props: { initialAssetId: { type: String, required: true }, initialNetwork: { type: String, required: true } },
  data() {
    return {
      assetId: this.initialAssetId,
      selectedNetwork: this.initialNetwork,
      amount: '',
      value: '',
      partialFee: '',
      recipient: '',
    };
  },
  template: `
    <TransferForm
      ref="form"
      extrinsicType="transfer"
      header="assets.sendFunds"
      v-model:assetId="assetId"
      v-model:selectedNetwork="selectedNetwork"
      v-model:amount="amount"
      v-model:value="value"
      v-model:partialFee="partialFee"
      v-model:recipient="recipient"
    />
  `,
});

const global = {
  mocks: { $t: (key: string) => key, $n: (value: number) => String(value) },
  stubs: {
    AboveForm: { template: '<main><slot /></main>' },
    Scroll: { template: '<div><slot /></div>' },
    InputWithIcon: {
      props: ['value'],
      emits: ['click'],
      template: '<button type="button" :data-value="value" @click="$emit(\'click\')" />',
    },
    SelectInput: {
      props: ['asset', 'assetId', 'totalAmount'],
      emits: ['togglePopupVisibility'],
      template:
        '<button type="button" data-test="asset-select" :data-asset="asset" :data-asset-id="assetId" :data-total="totalAmount" @click="$emit(\'togglePopupVisibility\')" />',
    },
    SelectPopup: {
      name: 'SelectPopup',
      props: ['options', 'value'],
      emits: ['toggleValue'],
      template:
        '<ul data-test="select-popup"><li v-for="option in options" :key="option.value" :data-selected="option.value === value" @click="$emit(\'toggleValue\', option.value)">{{ option.name }}</li></ul>',
    },
    FInput: true,
    BadgeButton: true,
    Alert: true,
    InfoRow: true,
    Tooltip: true,
    FButton: true,
  },
};

type TransferFormVm = {
  buttonText: string;
  currency?: TokenGroup;
  currencyBalance?: BalanceItem;
  transferAssetId: string;
  transferableAmount: number;
  optionsNetworks: { name: string; value: string }[];
};

let wrapper: VueWrapper | undefined;

async function mountTransfer(initialAssetId: string, initialNetwork: string) {
  wrapper = mount(Host, { props: { initialAssetId, initialNetwork }, global });
  await flushPromises();

  const form = wrapper.findComponent(TransferForm);

  return { host: wrapper, form, vm: form.vm as unknown as TransferFormVm };
}

const popupOptions = () => wrapper!.findAll('[data-test="select-popup"] li');

async function pickOption(name: string) {
  const option = popupOptions().find((item) => item.text() === name);

  expect(option, name).toBeDefined();
  await option!.trigger('click');
  await flushPromises();
}

describe('TransferForm network-scoped asset selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.checkTransfer.mockReset();
    mocks.checkTransfer.mockResolvedValue({ estimateFee: '0.001', destEstimateFee: '0', errors: [] });
    mocks.networks = [
      network('Polygon', 5, 'pol', 'ethereumBased'),
      network('Arbitrum One', 7, 'eth-arbitrum', 'ethereumBased'),
      network('OP Mainnet', 8, 'eth-op', 'ethereumBased'),
      network('Polkadot', 2, DOT, 'substrate', true, { chainId: POLKADOT, assets: [dot()] }),
      network('Polkadot AssetHub', 3, DOT, 'substrate', true, {
        chainId: POLKADOT_ASSET_HUB,
        assets: [dot(), { id: ASSET_HUB_USDT, symbol: 'usdt', precision: 6 }],
      }),
      network('Kusama', 4, 'ksm', 'substrate', false),
    ];
    mocks.balances = [
      group({ id: 'pol', networkName: 'Polygon', symbol: 'pol', total: '3', isUtility: true, relayChain: 'ethereum' }),
      group({ id: 'usdt-polygon', networkName: 'Polygon', symbol: 'usdt', total: '300', relayChain: 'ethereum' }),
      group({ id: 'eth-arbitrum', networkName: 'Arbitrum One', symbol: 'eth', total: '1', isUtility: true, relayChain: 'ethereum' }),
      group({ id: 'eth-op', networkName: 'OP Mainnet', symbol: 'eth', total: '1', isUtility: true, relayChain: 'ethereum' }),
      // Same registry id on two EVM networks: Arbitrum comes first in the store.
      group({ id: DAI, networkName: 'Arbitrum One', symbol: 'dai', total: '1', relayChain: 'ethereum' }),
      group({ id: DAI, networkName: 'OP Mainnet', symbol: 'dai', total: '25', relayChain: 'ethereum' }),
      // Same registry id on the relay chain and on AssetHub.
      group({ id: DOT, networkName: 'Polkadot', symbol: 'dot', total: '2', isUtility: true, relayChain: 'polkadot' }),
      group({ id: DOT, networkName: 'Polkadot AssetHub', symbol: 'dot', total: '0.5', isUtility: true, relayChain: 'polkadot' }),
      group({ id: ASSET_HUB_USDT, networkName: 'Polkadot AssetHub', symbol: 'usdt', total: '7', currencyId: '1984', relayChain: 'polkadot' }),
      group({ id: 'ksm', networkName: 'Kusama', symbol: 'ksm', total: '9', isUtility: true, relayChain: 'kusama' }),
    ];
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  it('keeps the network of the picked option instead of the first group with the same id', async () => {
    const { host, form, vm } = await mountTransfer('usdt-polygon', 'Polygon');

    await wrapper!.get('[data-test="asset-select"]').trigger('click');

    const labels = popupOptions().map((option) => option.text());
    expect(labels).toEqual(expect.arrayContaining(['DAI · Arbitrum One', 'DAI · OP Mainnet', 'USDT · Polygon']));
    expect(labels).not.toContain('KSM · Kusama'); // inactive network
    expect(popupOptions().find((option) => option.attributes('data-selected') === 'true')?.text()).toBe('USDT · Polygon');

    await pickOption('DAI · OP Mainnet');

    expect(form.emitted('update:selectedNetwork')?.at(-1)).toEqual(['OP Mainnet']);
    expect(form.emitted('update:selectedNetwork')?.flat()).not.toContain('Arbitrum One');
    expect(host.vm.$data).toMatchObject({ assetId: DAI, selectedNetwork: 'OP Mainnet' });
    expect(vm.currencyBalance?.name).toBe('op mainnet');
    expect(vm.transferableAmount).toBe(25);
    expect(wrapper!.get('[data-test="asset-select"]').attributes('data-total')).toBe('25');

    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    expect(mocks.checkTransfer).toHaveBeenLastCalledWith(
      expect.objectContaining({ networkKey: 'OP Mainnet', assetId: DAI })
    );
  });

  it('resolves a shared registry id from the route network (the id-only lookup picked Arbitrum)', async () => {
    const { vm } = await mountTransfer(DAI, 'OP Mainnet');

    expect(vm.currencyBalance?.name).toBe('op mainnet');
    expect(vm.transferableAmount).toBe(25);
    expect(mocks.checkTransfer).toHaveBeenCalledWith(expect.objectContaining({ networkKey: 'OP Mainnet', assetId: DAI }));
  });

  it('offers the networks of the approved DOT group and switches within it', async () => {
    const { host, vm } = await mountTransfer(DOT, 'Polkadot');

    expect(vm.optionsNetworks.map(({ name }) => name)).toEqual(['Polkadot', 'Polkadot AssetHub']);

    await wrapper!.get('[data-testid="transferNetwork"]').trigger('click');
    expect(popupOptions().map((option) => option.text())).toEqual(['Polkadot', 'Polkadot AssetHub']);

    await pickOption('Polkadot AssetHub');

    expect(host.vm.$data).toMatchObject({ assetId: DOT, selectedNetwork: 'Polkadot AssetHub' });
    expect(vm.currencyBalance?.name).toBe('polkadot assethub');
    expect(vm.transferableAmount).toBe(0.5);
  });

  it('switches between same-id networks from the asset picker without resetting the network', async () => {
    const { host, vm } = await mountTransfer(DOT, 'Polkadot');

    await wrapper!.get('[data-test="asset-select"]').trigger('click');
    await pickOption('DOT · Polkadot AssetHub');

    expect(host.vm.$data).toMatchObject({ assetId: DOT, selectedNetwork: 'Polkadot AssetHub' });
    expect(vm.transferableAmount).toBe(0.5);
  });

  it('sends the registry id when the route carries the portfolio canonical id', async () => {
    const { vm } = await mountTransfer('1984', 'Polkadot AssetHub');

    expect(vm.currency?.groupId).toBe(ASSET_HUB_USDT);
    expect(vm.transferAssetId).toBe(ASSET_HUB_USDT);
    expect(vm.transferableAmount).toBe(7);
    expect(mocks.checkTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ networkKey: 'Polkadot AssetHub', assetId: ASSET_HUB_USDT })
    );

    await wrapper!.get('[data-test="asset-select"]').trigger('click');
    const selected = popupOptions().find((option) => option.attributes('data-selected') === 'true');
    expect(selected?.text()).toBe('USDT · Polkadot AssetHub');
  });

  it('never offers an Iroha network, whose sends stay compiled off, and names it when a route opens one', async () => {
    mocks.networks.push(network('SORA Nexus', 9, 'xor-nexus', 'iroha'));
    mocks.balances.push(
      group({ id: 'xor-nexus', networkName: 'SORA Nexus', symbol: 'xor', total: '40', isUtility: true, relayChain: 'iroha' })
    );

    await mountTransfer('usdt-polygon', 'Polygon');
    await wrapper!.get('[data-test="asset-select"]').trigger('click');

    expect(popupOptions().map((option) => option.text())).not.toContain('XOR · SORA Nexus');
    wrapper!.unmount();

    mocks.checkTransfer.mockClear();
    const { vm } = await mountTransfer('xor-nexus', 'SORA Nexus');
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();

    expect(vm.optionsNetworks).toEqual([]);
    expect(vm.buttonText).toBe('assets.irohaTransfersDisabled');
    expect(mocks.checkTransfer).not.toHaveBeenCalled();
  });

  it('round-trips the picked value to the same pair the transfer request uses', async () => {
    await mountTransfer('usdt-polygon', 'Polygon');
    await wrapper!.get('[data-test="asset-select"]').trigger('click');

    const popup = wrapper!.findComponent({ name: 'SelectPopup' });
    const { options } = popup.props() as { options: { name: string; value: string }[] };
    const opDai = options.find(({ name }) => name === 'DAI · OP Mainnet')!;

    expect(parseTransferAssetOptionValue(opDai.value)).toEqual({ assetId: DAI, network: 'OP Mainnet' });
  });
  describe('within an approved token group', () => {
    beforeEach(() => {
      mocks.networks.push(
        network('Polkadot People', 30, PEOPLE_DOT, 'substrate', true, { chainId: POLKADOT_PEOPLE, assets: [dot(PEOPLE_DOT)] }),
        network('Ethereum', 1, 'eth', 'ethereum', true, {
          chainId: '1',
          assets: [
            { id: 'eth', symbol: 'eth', precision: 18 },
            { id: ETHEREUM_USDT, symbol: 'usdt', precision: 6 },
          ],
        }),
        network('Avalanche C-Chain', 6, 'avax', 'ethereum', true, {
          chainId: '43114',
          assets: [
            { id: 'avax', symbol: 'avax', precision: 18 },
            { id: AVALANCHE_USDT, symbol: 'usdt', precision: 6 },
          ],
        })
      );
      // Polygon's USDT is bridged: the registry prices it as Tether, but it is not in the USDT group.
      const polygon = mocks.networks.find(({ name }) => name === 'Polygon') as unknown as { chainId: string; assets: unknown[] };
      Object.assign(polygon, { chainId: '137', assets: [{ id: 'pol', symbol: 'pol', precision: 18 }, { id: POLYGON_USDT, symbol: 'usdt', precision: 6 }] });
      mocks.balances = (mocks.balances as TokenGroup[]).map((item) =>
        item.groupId === 'usdt-polygon'
          ? group({ id: POLYGON_USDT, networkName: 'Polygon', symbol: 'usdt', total: '300', relayChain: 'ethereum' })
          : item
      );
      mocks.balances.push(
        group({ id: PEOPLE_DOT, networkName: 'Polkadot People', symbol: 'dot', total: '4', isUtility: true, relayChain: 'polkadot' }),
        group({ id: 'eth', networkName: 'Ethereum', symbol: 'eth', total: '1', isUtility: true, relayChain: 'ethereum' }),
        group({ id: ETHEREUM_USDT, networkName: 'Ethereum', symbol: 'usdt', total: '50', relayChain: 'ethereum' }),
        group({ id: 'avax', networkName: 'Avalanche C-Chain', symbol: 'avax', total: '2', isUtility: true, relayChain: 'ethereum' }),
        group({ id: AVALANCHE_USDT, networkName: 'Avalanche C-Chain', symbol: 'usdt', total: '6', relayChain: 'ethereum' })
      );
    });

    it('lists the issuer-native USDT networks and never the bridged look-alike on Polygon', async () => {
      const { vm } = await mountTransfer(ETHEREUM_USDT, 'Ethereum');

      expect(vm.optionsNetworks.map(({ name }) => name)).toEqual(['Ethereum', 'Polkadot AssetHub', 'Avalanche C-Chain']);
      expect(wrapper!.get('[data-testid="sendGroupNetworkWarning"]').text()).toContain('assets.sendGroupNetworkWarning');
    });

    it('switches the network and that network’s USDT together, and clears the typed amount', async () => {
      const { host, vm } = await mountTransfer(ETHEREUM_USDT, 'Ethereum');
      (host.vm.$data as { amount: string }).amount = '40';
      await flushPromises();

      await wrapper!.get('[data-testid="transferNetwork"]').trigger('click');
      await pickOption('Polkadot AssetHub');

      expect(host.vm.$data).toMatchObject({ assetId: ASSET_HUB_USDT, selectedNetwork: 'Polkadot AssetHub', amount: '' });
      expect(vm.currencyBalance?.name).toBe('polkadot assethub');
      expect(vm.transferAssetId).toBe(ASSET_HUB_USDT);
      expect(vm.transferableAmount).toBe(7);

      mocks.checkTransfer.mockClear();
      (host.vm.$data as { amount: string }).amount = '1';
      await vi.advanceTimersByTimeAsync(2000);
      await flushPromises();
      expect(mocks.checkTransfer).toHaveBeenLastCalledWith(
        expect.objectContaining({ networkKey: 'Polkadot AssetHub', assetId: ASSET_HUB_USDT })
      );
    });

    it('moves to a group member with its own registry id (DOT on Polkadot People)', async () => {
      const { host, vm } = await mountTransfer(DOT, 'Polkadot');

      expect(vm.optionsNetworks.map(({ name }) => name)).toEqual(['Polkadot', 'Polkadot AssetHub', 'Polkadot People']);

      await wrapper!.get('[data-testid="transferNetwork"]').trigger('click');
      await pickOption('Polkadot People');

      expect(host.vm.$data).toMatchObject({ assetId: PEOPLE_DOT, selectedNetwork: 'Polkadot People' });
      expect(vm.transferableAmount).toBe(4);
    });

    it('offers no other network for an asset outside every group, even one with the same address elsewhere', async () => {
      const { vm } = await mountTransfer(DAI, 'OP Mainnet');

      expect(vm.optionsNetworks.map(({ name }) => name)).toEqual(['OP Mainnet']);
      expect(wrapper!.find('[data-testid="sendGroupNetworkWarning"]').exists()).toBe(false);
    });
  });
});
