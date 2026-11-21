import { flushPromises, mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { SORA_NETWORK_NAME, SORA_VAL_ASSET_ID, SORA_XOR_ASSET_ID } from '@/consts/sora';

// The swap and pool screens price an asset as the portfolio does (getTransferAssetPrice), like Send: a token whose
// registry asset has no price shows "Price unavailable", even when its token group carries a loaded price id.
const boundary = vi.hoisted(() => ({
  accounts: {} as Record<string, unknown>,
  networks: {} as Record<string, unknown>,
  pools: {} as Record<string, unknown>,
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/stores/pools', () => ({ usePoolsStore: () => boundary.pools }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { actions: { polkaswap: true } } }) }));
vi.mock('@/util/useWalletRecovery', () => ({ useWalletRecovery: () => false }));
vi.mock('@/extension/messaging', () => ({
  checkSwap: vi.fn(),
  getShareOfPool: vi.fn(async () => '1'),
  getAmountPoolValue: vi.fn(async () => '0'),
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'portfolioPage.priceUnavailable' ? 'Price unavailable' : key),
    n: (value: number, format: string) => (format === 'price' ? value.toFixed(2) : String(value)),
  }),
}));
vi.mock('@/screens/polkaswap/PolkaswapAlert.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/pools/PoolsBanner.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/pools/PoolHeader.vue', () => ({ default: { template: '<div />' } }));

import DirectionContentForm from '@/components/DirectionContentForm.vue';
import SwapForm from '@/screens/polkaswap/swap/SwapForm.vue';
import SwapPreview from '@/screens/polkaswap/swap/SwapPreview.vue';
import SwapInfo from '@/screens/polkaswap/swap/SwapInfo.vue';
import PoolDetails from '@/screens/pools/PoolDetails.vue';
import PoolDescription from '@/screens/pools/PoolDescription.vue';
import InputsForm from '@/screens/pools/InputsForm.vue';

// A SORA token whose registry asset has no price id (as UMI in the production list).
const UMI = '0x003252667a82d2dd70fa046eea663eaec1f2e37c20879f113b880b04c5ebd805';
const sora = {
  name: SORA_NETWORK_NAME,
  chainId: 'sora-chain',
  ecosystem: 'substrate',
  active: true,
  disabled: false,
  networkStatus: NETWORK_STATUS.CONNECTED,
  assets: [
    { id: SORA_XOR_ASSET_ID, symbol: 'xor', priceId: 'sora', precision: 18, isUtility: true },
    { id: SORA_VAL_ASSET_ID, symbol: 'val', priceId: 'sora-validator-token', precision: 18 },
    { id: UMI, symbol: 'umi', precision: 18 },
  ],
} as unknown as NetworkJson;
// Every group carries a loaded price id, including UMI's, which the portfolio does not trust.
const group = (groupId: string, symbol: string, priceId: string): TokenGroup =>
  ({
    groupId,
    symbol,
    tokenName: symbol,
    priceId,
    icon: '',
    relayChain: 'substrate',
    mainNetwork: SORA_NETWORK_NAME,
    providers: [],
    balances: [
      {
        id: groupId,
        name: SORA_NETWORK_NAME.toLowerCase(),
        symbol,
        precision: 18,
        total: '10',
        transferable: '10',
        free: '10',
        isUtility: symbol === 'xor',
        existentialDeposit: '0',
      },
    ],
  }) as unknown as TokenGroup;
const prices = { sora: 2, 'sora-validator-token': 3, polkaswap: 5 };

function setup(tokenPriceMap: Record<string, number> = prices) {
  boundary.accounts = reactive({
    accounts: [{ address: 'alice' }],
    selectedWallet: { address: 'alice' },
    fiatSymbol: '$',
    showPolkaswapAlert: false,
    balances: [
      group(SORA_XOR_ASSET_ID, 'xor', 'sora'),
      group(SORA_VAL_ASSET_ID, 'val', 'sora-validator-token'),
      group(UMI, 'umi', 'polkaswap'),
    ],
  });
  boundary.networks = reactive({
    allNetworks: [sora],
    networks: [sora],
    assetsPrice: { tokenPriceMap: { ...tokenPriceMap } },
    soraFees: { Swap: '0.01', AddLiquidity: '0.02', RemoveLiquidity: '0.02' },
    getNetwork: (name: string) => [sora].find((network) => network.name.toLowerCase() === name?.toLowerCase()),
    // The old path: a group price id looked up here. Nothing may ask for it any more.
    getAssetPrice: vi.fn(() => ({ price: 999, priceChange: 0, isExist: true })),
  });
}

const wrappers: VueWrapper[] = [];
const keep = <T extends VueWrapper>(wrapper: T): T => {
  wrappers.push(wrapper);
  return wrapper;
};
const slot = { template: '<div><slot /></div>' };
const infoRow = {
  props: ['text', 'value', 'price'],
  template: '<div class="info" :data-label="text"><b>{{ value }}</b><span class="fiat">{{ price }}</span></div>',
};
const selectInput = {
  name: 'SelectInput',
  props: ['value', 'priceUnavailable', 'asset', 'amount'],
  template: '<div class="select-input" :data-asset="asset" :data-value="value" :data-unavailable="String(priceUnavailable)" />',
};
const popup = { name: 'ConfirmationPasswordPopup', props: ['value', 'priceUnavailable', 'feeValue'], template: '<div />' };
const mocks = {
  $t: (key: string) => (key === 'portfolioPage.priceUnavailable' ? 'Price unavailable' : key),
  $n: (value: number, format: string) => (format === 'price' ? Number(value).toFixed(2) : String(value)),
  $router: { back: vi.fn(), push: vi.fn() },
};
const global = (extra: Record<string, unknown> = {}) => ({
  mocks: { ...mocks, $route: { params: {}, query: {} }, ...extra },
  components: { DirectionContentForm },
  stubs: {
    AboveForm: { template: '<div><slot name="header" /><slot /></div>' },
    Scroll: slot,
    ContentForm: slot,
    InfoRow: infoRow,
    SelectInput: selectInput,
    ConfirmationPasswordPopup: popup,
    Icon: true,
    FButton: true,
    Tooltip: true,
    Alert: true,
    SelectPopup: true,
    PolkaswapSettings: true,
    PolkaswapSettingsHeader: true,
  },
});
const sides = (wrapper: VueWrapper) => wrapper.findAll('.select-input').map((input) => ({
  asset: input.attributes('data-asset'),
  value: input.attributes('data-value'),
  unavailable: input.attributes('data-unavailable'),
}));

beforeEach(() => setup());
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllMocks();
});

describe('swap prices', () => {
  async function swap(data: Record<string, unknown>) {
    const wrapper = keep(shallowMount(SwapForm, { global: { ...global(), renderStubDefaultSlot: true } }));
    await wrapper.setData({
      sendAssetId: SORA_XOR_ASSET_ID,
      receiveAssetId: UMI,
      sendAmount: '1',
      receiveAmount: '4',
      minMaxAmount: '3.9',
      AToB: '4',
      BToA: '0.25',
      ...data,
    });
    return wrapper;
  }

  it('prices the trusted asset and says "Price unavailable" for a token whose group lends a price', async () => {
    const wrapper = await swap({});
    const vm = wrapper.vm as unknown as Record<string, unknown>;

    expect(sides(wrapper)).toEqual([
      { asset: 'xor', value: '2', unavailable: 'false' },
      { asset: 'umi', value: '', unavailable: 'true' },
    ]);
    // XOR / UMI prices the 10 XOR held; UMI / XOR has no price.
    expect(wrapper.get('[data-testid="AtoBfiatPrice"]').text()).toBe('$ 20.00');
    expect(wrapper.get('[data-testid="BtoAfiatPrice"]').text()).toBe('Price unavailable');
    // Exact send: the least received is UMI.
    expect(vm.minMaxAmountPrice).toBe('Price unavailable');
    // The fee is 0.01 XOR at XOR's own price.
    expect(vm.feePrice).toBe('$ 0.02');
    expect((boundary.networks.getAssetPrice as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('prices the most sold by the asset sold, not by its id read as a price id', async () => {
    const wrapper = await swap({ isExchangeB: true });

    expect((wrapper.vm as unknown as { minMaxAmountPrice: string }).minMaxAmountPrice).toBe('$ 7.80');
    expect((boundary.networks.getAssetPrice as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('passes the decision to the preview and the confirmation', async () => {
    const wrapper = await swap({ sendAssetId: UMI, receiveAssetId: SORA_VAL_ASSET_ID, step: 2 });
    const preview = wrapper.getComponent(SwapPreview);

    expect(preview.props()).toMatchObject({
      sendValue: '',
      receiveValue: '12',
      sendPriceUnavailable: true,
      receivePriceUnavailable: false,
    });
    await wrapper.setData({ showConfirmationPasswordPopup: true });
    expect(wrapper.getComponent(popup).props()).toMatchObject({ value: '', priceUnavailable: true });
  });

  it('says "Price unavailable" for the fee when XOR has no price', async () => {
    setup({ 'sora-validator-token': 3, polkaswap: 5 });
    const wrapper = await swap({ receiveAssetId: SORA_VAL_ASSET_ID });

    expect((wrapper.vm as unknown as { feePrice: string }).feePrice).toBe('Price unavailable');
    expect(sides(wrapper)[0]).toEqual({ asset: 'xor', value: '', unavailable: 'true' });
    expect(wrapper.get('[data-testid="AtoBfiatPrice"]').text()).toBe('Price unavailable');
  });

  it('shows the review with "Price unavailable" for the unpriced side and the fee as given', () => {
    const wrapper = keep(
      mount(SwapPreview, {
        props: {
          marketType: 'SMART',
          sendAmount: '1',
          receiveAmount: '4',
          sendValue: '2',
          receiveValue: '',
          sendPriceUnavailable: false,
          receivePriceUnavailable: true,
          sendAssetUP: 'XOR',
          receiveAssetUP: 'UMI',
          fee: '0.01',
          feePrice: 'Price unavailable',
        },
        global: { ...global(), stubs: { ...global().stubs, SwapInfo } },
      })
    );

    expect(wrapper.get('[data-testid="sendPrice"]').text()).toBe('$ 2.00');
    expect(wrapper.get('[data-testid="receivePrice"]').text()).toBe('Price unavailable');
    expect(wrapper.get('[data-label="assets.networkFee"] .fiat').text()).toBe('Price unavailable');
  });
});

describe('pool prices', () => {
  const asset = (id: string, name: string, priceId: string) => ({
    id,
    name,
    assetKey: `key-${name}`,
    priceId,
    reserve: '100',
    tokenBalance: '5',
    transferableAmount: '10',
    icon: '',
    color: '',
  });
  const pool = (first: ReturnType<typeof asset>, second: ReturnType<typeof asset>) => ({
    network: SORA_NETWORK_NAME,
    asset1: first,
    asset2: second,
    isMyPool: false,
    rewardAsset: 'PSWAP',
    tvl: '0',
    apy: '0',
  });
  const xor = asset(SORA_XOR_ASSET_ID, 'xor', 'sora');
  const umi = asset(UMI, 'umi', 'polkaswap');

  function details(params: ReturnType<typeof pool>) {
    boundary.pools = reactive({ poolsItems: [params], myPoolsItems: [], getPoolsParams: vi.fn() });
    return keep(
      shallowMount(PoolDetails, {
        global: {
          ...global({ $route: { params: {}, query: { asset1Key: params.asset1.assetKey, asset2Key: params.asset2.assetKey } } }),
          renderStubDefaultSlot: true,
          stubs: { ...global().stubs, PoolDescription: true, InputsForm: true, DirectionContentForm },
        },
      })
    );
  }

  it('prices the pool review with each asset\'s trusted price, not "$ 0.00"', async () => {
    const wrapper = details(pool(xor, umi));
    await wrapper.setData({ step: 3, amount1: '2', amount2: '4', extrinsicType: 'addLiquidity' });

    expect(wrapper.get('[data-testid="sendPrice"]').text()).toBe('$ 4.00');
    expect(wrapper.get('[data-testid="receivePrice"]').text()).toBe('Price unavailable');
    await wrapper.setData({ showConfirmationPasswordPopup: true });
    expect(wrapper.getComponent(popup).props()).toMatchObject({ value: '4', priceUnavailable: false, feeValue: '0.04' });
    expect((boundary.networks.getAssetPrice as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('says "Price unavailable" in the confirmation when the pool\'s first asset has no trusted price', async () => {
    const wrapper = details(pool(umi, xor));
    await wrapper.setData({ step: 3, amount1: '4', amount2: '2', extrinsicType: 'addLiquidity' });

    expect(wrapper.get('[data-testid="sendPrice"]').text()).toBe('Price unavailable');
    expect(wrapper.get('[data-testid="receivePrice"]').text()).toBe('$ 4.00');
    await wrapper.setData({ showConfirmationPasswordPopup: true });
    expect(wrapper.getComponent(popup).props()).toMatchObject({ value: '', priceUnavailable: true });
  });

  it('prices the pool inputs with the trusted decision', async () => {
    const [xorGroup, , umiGroup] = boundary.accounts.balances as TokenGroup[];
    const wrapper = keep(
      shallowMount(InputsForm, {
        props: {
          poolParams: pool(xor, umi),
          currency1: xorGroup,
          currency2: umiGroup,
          amount1: '2',
          amount2: '4',
          fee: '0.02',
          extrinsicType: 'addLiquidity',
        },
        global: global(),
      })
    );
    await flushPromises();

    expect(sides(wrapper)).toEqual([
      { asset: 'xor', value: '4', unavailable: 'false' },
      { asset: 'umi', value: '', unavailable: 'true' },
    ]);
    expect((boundary.networks.getAssetPrice as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it.each([
    ['XOR priced', prices, '$ 0.04'],
    ['XOR without a price', { polkaswap: 5 }, 'Price unavailable'],
  ])('prices the network fee in the pool description (%s)', async (_label, tokenPriceMap, expected) => {
    setup(tokenPriceMap);
    const wrapper = keep(
      shallowMount(PoolDescription, {
        props: { poolParams: pool(xor, umi), showAdditionalInfo: true, fee: '0.02', extrinsicType: 'addLiquidity', slippage: 0.5 },
        global: global(),
      })
    );
    await flushPromises();

    expect(wrapper.get('[data-label="assets.networkFee"] .fiat').text()).toBe(expected);
    expect((boundary.networks.getAssetPrice as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
