import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
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

const network = (name: string, rank: number, utilityId: string, ecosystem = 'substrate', active = true): NetworkJson =>
  ({
    name,
    chainId: `${name.toLowerCase()}-chain`,
    active,
    ecosystem,
    rank,
    assets: [{ id: utilityId }],
    favorite: [],
  }) as unknown as NetworkJson;

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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mocks.checkTransfer.mockReset();
    mocks.checkTransfer.mockResolvedValue({ estimateFee: '0.001', destEstimateFee: '0', errors: [] });
    mocks.networks = [
      network('Polygon', 5, 'pol', 'ethereumBased'),
      network('Arbitrum One', 7, 'eth-arbitrum', 'ethereumBased'),
      network('OP Mainnet', 8, 'eth-op', 'ethereumBased'),
      network('Polkadot', 2, DOT),
      network('Polkadot AssetHub', 3, DOT),
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

  it('offers every network that holds the same registry asset and switches within it', async () => {
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

  it('round-trips the picked value to the same pair the transfer request uses', async () => {
    await mountTransfer('usdt-polygon', 'Polygon');
    await wrapper!.get('[data-test="asset-select"]').trigger('click');

    const popup = wrapper!.findComponent({ name: 'SelectPopup' });
    const { options } = popup.props() as { options: { name: string; value: string }[] };
    const opDai = options.find(({ name }) => name === 'DAI · OP Mainnet')!;

    expect(parseTransferAssetOptionValue(opDai.value)).toEqual({ assetId: DAI, network: 'OP Mainnet' });
  });
});
