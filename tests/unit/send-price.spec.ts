import { flushPromises, mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { APIItemState } from '@extension-base/api/types/networks';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { UNTRUSTED_ASSETS } from '@/portfolio/canonicalGroups';
import { getTransferAssetOptions, getTransferAssetPrice } from '@/helpers/currencies';

const boundary = vi.hoisted(() => ({ accounts: {} as Record<string, unknown>, networks: {} as Record<string, unknown> }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', CrossChain: 'CrossChain', SendForm: 'SendForm' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => boundary.accounts }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => boundary.networks }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => ({ features: { actions: {} } }) }));
vi.mock('@/extension/messaging', () => ({ checkTransfer: vi.fn(), checkCrossChain: vi.fn(), checkScamAddress: vi.fn() }));
vi.mock('@/feel/sound', () => ({ playSound: vi.fn(), prepareSounds: vi.fn() }));
vi.mock('@/screens/wallet&asset/HistoryBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/screens/wallet&asset/EditAddressBook.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/util/BaseApi', () => ({ default: {
  formatAddress: () => 'wallet', isSameAddress: () => false, isBitcoinNetwork: () => false, isEthereumNetwork: () => false,
  isSolanaNetwork: () => false, validateAddress: () => false, validateAddressByNetwork: () => true,
} }));

import TransferForm from '@/screens/wallet&asset/TransferForm.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';
import SelectInput from '@/components/SelectInput.vue';

const ETH = 'c2a6c062-d511-4bde-9ce6-ea775d2a302c';
const KICK = '0xC12D1c73eE7DC3615BA4e37E4ABFdbDDFA38907E';
const blocked = UNTRUSTED_ASSETS[0];
const ethereum = {
  name: 'Ethereum', chainId: '1', ecosystem: 'ethereum', active: true, favorite: [],
  assets: [{ id: ETH, symbol: 'eth', priceId: 'ethereum', precision: 18 }],
} as unknown as NetworkJson;
const kusama = {
  name: 'Kusama AssetHub', chainId: blocked.chainId, ecosystem: 'substrate', active: true, favorite: [],
  assets: [{ id: 'ksm', symbol: 'ksm', priceId: 'kusama', precision: 12 },
    { id: blocked.assetId, symbol: 'usdt', priceId: 'tether', precision: 4 }],
} as unknown as NetworkJson;
const prices = { ethereum: 2000, kusama: 20, tether: 1 };
const group = (network: NetworkJson, id: string, symbol: string, extra: Partial<BalanceItem> = {}): TokenGroup => ({
  groupId: id, mainNetwork: network.name, symbol, tokenName: symbol, icon: '', relayChain: network.ecosystem,
  // Deliberately lend every group a loaded price, including the discovered and untrusted tokens.
  priceId: id === ETH ? 'ethereum' : 'tether', providers: [],
  balances: [{ id, name: network.name.toLowerCase(), symbol, icon: '', precision: 18,
    state: APIItemState.READY, total: '10', transferable: '10', free: '10', ...extra } as BalanceItem],
} as TokenGroup);
const eth = () => group(ethereum, ETH, 'eth', { isUtility: true });
const kick = () => group(ethereum, KICK, 'kick', {
  assetMetadataTrust: 'unverified', assetMetadataSource: 'tokenList', priceId: 'ethereum',
});
const untrusted = () => group(kusama, blocked.assetId, 'usdt', { currencyId: '11' });
const cases = [
  { label: 'token-list ERC-20', network: ethereum, token: kick, priced: false, fee: '$20.00' },
  { label: 'asset on the untrusted list', network: kusama, token: untrusted, priced: false, fee: '$0.20' },
  { label: 'priced ETH', network: ethereum, token: eth, priced: true, fee: '$20.00' },
];
const wrappers: VueWrapper[] = [];
const keep = <T extends VueWrapper>(wrapper: T): T => { wrappers.push(wrapper); return wrapper; };
const slot = { template: '<div><slot /></div>' };
const infoRow = { props: ['text', 'value', 'price'], template: '<div class="info" :data-label="text"><b>{{ value }}</b><span class="fiat">{{ price }}</span></div>' };
const global = {
  mocks: {
    $t: (key: string) => key === 'portfolioPage.priceUnavailable' ? 'Price unavailable' : key,
    $n: (value: number, format: string) => format === 'price' ? value.toFixed(2) : String(value),
    $router: { back: vi.fn(), push: vi.fn() },
  },
  stubs: { AboveForm: slot, Scroll: slot, FCorners: slot, InfoRow: infoRow, SelectInput, Icon: true, FButton: true, SelectPopup: true,
    InputWithIcon: true, FInput: true, BadgeButton: true, Alert: true, Tooltip: true, ExternalLogo: true, Rotate: true,
    ConfirmationPasswordPopup: true, Popup: slot, SealFigure: true, SignMobile: true },
  components: { SelectInput },
};
function setup(network: NetworkJson, token: TokenGroup) {
  const utility = network === ethereum ? eth() : group(kusama, 'ksm', 'ksm', { isUtility: true });
  boundary.accounts = reactive({ balances: token.balances[0].isUtility ? [token] : [token, utility],
    fiatSymbol: '$', selectedNetwork: network.name, accounts: [], acountsEcosystem: [],
    selectedWallet: { name: 'Wallet', address: 'wallet', ethereumAddress: '0xwallet' } });
  boundary.networks = reactive({ assetsPrice: { tokenPriceMap: { ...prices } }, networks: [ethereum, kusama],
    allNetworks: [ethereum, kusama], getNetwork: (name: string) => [ethereum, kusama].find((n) => n.name.toLowerCase() === name?.toLowerCase()),
    getAssetPrice: vi.fn(() => ({ price: 999 })),
  });
}
const reviewGlobal = (network: NetworkJson, token: TokenGroup) => ({
  ...global, mocks: { ...global.mocks, $route: { params: { assetId: token.groupId, network: network.name }, query: {} } },
  stubs: { ...global.stubs, TransferForm: { template: '<div><slot name="step2" /></div>' } },
});
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.clearAllMocks(); });

// Disable only background fee estimation; the template, price decisions, amount and Max handlers are real.
const Transfer = defineComponent({ extends: TransferForm, methods: { calculateEstimates: vi.fn() } });
function mountTransfer(network: NetworkJson, token: TokenGroup) {
  return keep(shallowMount(Transfer, { global, props: { extrinsicType: 'transfer', selectedNetwork: network.name,
    assetId: token.groupId, amount: '2', value: '4000', partialFee: '0.01', destNetFee: '0.5' } }));
}

describe.each(cases)('$label', ({ network, token: makeToken, priced, fee }) => {
  it('retains the portfolio decision in the completed transfer popup', async () => {
    const token = makeToken(); setup(network, token);
    // Prevent dispatch, but keep the real popup, result states and fiat formatting.
    const Confirmation = defineComponent({ extends: ConfirmationPasswordPopup, methods: { sendExtrinsic: vi.fn() } });
    const wrapper = keep(shallowMount(Transfer, {
      global: { ...global, stubs: { ...global.stubs, ConfirmationPasswordPopup: Confirmation } },
      props: { extrinsicType: 'transfer', selectedNetwork: network.name, assetId: token.groupId,
        amount: '2', value: priced ? '4000' : '' },
    }));
    await wrapper.setData({ showConfirmationPasswordPopup: true });
    const popup = wrapper.getComponent(Confirmation);
    for (const transactionState of ['success', 'unconfirmed']) {
      await popup.setData({ transactionState });
      expect(popup.get('[data-testid="confirmedTransferValue"]').text()).toBe(priced ? '$4000.00' : 'Price unavailable');
    }
  });

  it('shows the portfolio decision in TransferForm and its amount input, with an independently priced utility fee', async () => {
    const token = makeToken(); setup(network, token);
    const wrapper = mountTransfer(network, token);
    expect(wrapper.get('[data-testid="fiatAmount"]').text()).toBe(priced ? '$4000.00' : 'Price unavailable');
    expect(wrapper.get('[data-label="assets.networkFee"] .fiat').text()).toBe(fee);
    const vm = wrapper.vm as unknown as { updateAmount: (amount: string) => void; followMaxAmount: (fee: string) => void; destNetFiatFeeCut: string };
    vm.updateAmount('3');
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual([priced ? '6000' : '']);
    vm.followMaxAmount('0.01');
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual([priced ? '18980' : '']);
    expect(vm.destNetFiatFeeCut).toBe(priced ? '$1000.00' : 'Price unavailable');
    expect(boundary.networks.getAssetPrice).not.toHaveBeenCalled();
  });

  it('keeps an unpriced Max amount from emitting zero fiat', async () => {
    const token = makeToken(); setup(network, token);
    const wrapper = mountTransfer(network, token);
    const vm = wrapper.vm as unknown as {
      verifyTx: () => Promise<{ estimateFee: string; maxAmount: string }>;
      setMax: () => Promise<void>;
    };
    vi.spyOn(vm, 'verifyTx').mockResolvedValue({ estimateFee: '0.01', maxAmount: '9.99' });
    await vm.setMax();
    expect(wrapper.emitted('update:amount')?.at(-1)).toEqual(['9.99']);
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual([priced ? '19980' : '']);
  });

  it('shows the same decision in SendForm confirmation and keeps amount/fee denominations', async () => {
    const token = makeToken(); setup(network, token);
    const wrapper = keep(shallowMount(SendForm, { global: reviewGlobal(network, token) }));
    await wrapper.setData({ amount: '2', value: priced ? '4000' : '0', partialFee: '0.01' });
    expect(wrapper.get('[data-label="assets.assetsAmount"] b').text()).toBe(`2 ${token.symbol.toUpperCase()}`);
    expect(wrapper.get('[data-label="assets.assetsAmount"] .fiat').text()).toBe(priced ? '$4000.00' : 'Price unavailable');
    expect(wrapper.get('[data-label="assets.networkFee"] .fiat').text()).toBe(fee);
    if (priced) expect(wrapper.get('[data-label="assets.total"] .fiat').text()).toBe('$4020.00');
    else expect(wrapper.find('[data-label="assets.total"]').exists()).toBe(false);
  });

  it('does not format an unknown value in CrossChainForm confirmation', async () => {
    const token = makeToken(); setup(network, token);
    // Route eligibility has separate tests. Exercise pricing for every trust case if a route is reviewed.
    const CrossChain = defineComponent({ extends: CrossChainForm, computed: {
      reviewedRoute: () => ({ id: 'reviewed', assetId: token.groupId, originNetwork: network.name,
        destinationNetwork: 'Destination', enabled: true, protocol: 'XCM', assetKey: 'key', providerId: 'wallet-xcm' }),
      routeAsset: () => ({ groupId: token.groupId, symbol: token.symbol }),
    } });
    const wrapper = keep(shallowMount(CrossChain, { global: reviewGlobal(network, token) }));
    await wrapper.setData({ amount: '2', value: priced ? '4000' : '0' });
    expect(wrapper.get('[data-testid="amountCC"] .fiat').text()).toBe(priced ? '$4000.00' : 'Price unavailable');
  });

});

describe('price changes and missing fee prices', () => {
  it('does not borrow a fee price from another network with the same utility id', () => {
    setup(ethereum, kick());
    const other = group({ ...ethereum, name: 'Other' }, ETH, 'fake', { isUtility: true });
    (boundary.accounts.balances as TokenGroup[]).unshift(other);
    const wrapper = mountTransfer(ethereum, kick());
    expect(wrapper.get('[data-label="assets.networkFee"] b').text()).toBe('0.01 ETH');
    expect(wrapper.get('[data-label="assets.networkFee"] .fiat').text()).toBe('$20.00');
  });

  it('marks an unavailable utility fee and total without losing a known amount value', async () => {
    setup(ethereum, eth());
    const wrapper = keep(shallowMount(SendForm, { global: reviewGlobal(ethereum, eth()) }));
    await wrapper.setData({ amount: '2', value: '4000', partialFee: '0.01' });
    // No utility balance is available: a total must not claim to be complete.
    (boundary.accounts.balances as TokenGroup[])[0].balances[0].isUtility = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-label="assets.networkFee"] .fiat').text()).toBe('Price unavailable');
    expect((wrapper.vm as unknown as { fiatTotalString: string }).fiatTotalString).toBe('Price unavailable');
  });

  it('marks a native-asset total unavailable when its trusted price has not loaded', async () => {
    setup(ethereum, eth());
    (boundary.networks.assetsPrice as { tokenPriceMap: Record<string, number> }).tokenPriceMap = {};
    const wrapper = keep(shallowMount(SendForm, { global: reviewGlobal(ethereum, eth()) }));
    await wrapper.setData({ amount: '2', value: '0', partialFee: '0.01' });
    expect(wrapper.findAll('.fiat').map((row) => row.text())).toEqual([
      'Price unavailable', 'Price unavailable', 'Price unavailable',
    ]);
    expect(wrapper.text()).not.toContain('$');
  });

  it('updates amount and fee displays when prices arrive and disappear', async () => {
    setup(ethereum, eth());
    const assetsPrice = boundary.networks.assetsPrice as { tokenPriceMap: Record<string, number> };
    assetsPrice.tokenPriceMap = {};
    const wrapper = mountTransfer(ethereum, eth());
    expect(wrapper.get('[data-testid="fiatAmount"]').text()).toBe('Price unavailable');
    expect(wrapper.get('[data-label="assets.networkFee"] .fiat').text()).toBe('Price unavailable');
    assetsPrice.tokenPriceMap = prices;
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['4000']);
    expect(wrapper.get('[data-testid="fiatAmount"]').text()).toBe('$4000.00');
    assetsPrice.tokenPriceMap = {};
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['']);
    expect(wrapper.get('[data-testid="fiatAmount"]').text()).toBe('Price unavailable');
  });

  it('does not rank discovered or untrusted tokens by their group price in the asset picker', () => {
    const discovered = kick(); discovered.balances[0].total = '999999';
    const listed = untrusted(); listed.balances[0].total = '999999';
    const options = getTransferAssetOptions([discovered, listed, eth()],
      (name) => [ethereum, kusama].find((network) => network.name.toLowerCase() === name.toLowerCase()), { prices });
    expect(options[0].name).toBe('ETH · Ethereum');
  });

  it('leaves no fiat value from the previous asset when another asset is chosen', async () => {
    setup(ethereum, kick());
    (boundary.accounts.balances as TokenGroup[]).push(eth());
    // The Send screen's own two-way bindings, so each emitted value reaches the form again as a prop.
    const Host = defineComponent({
      components: { Transfer },
      data: () => ({ assetId: KICK, network: 'Ethereum', amount: '2', value: '', fee: '0.01' }),
      template: `<Transfer extrinsicType="transfer" v-model:assetId="assetId" v-model:selectedNetwork="network"
        v-model:amount="amount" v-model:value="value" v-model:partialFee="fee" />`,
    });
    const host = keep(mount(Host, { global }));
    const state = host.vm as unknown as { assetId: string; amount: string; value: string };
    expect(host.get('[data-testid="fiatAmount"]').text()).toBe('Price unavailable');

    for (const [assetId, fiat] of [[ETH, '$0.00'], [KICK, 'Price unavailable']]) {
      state.amount = '2';
      await host.vm.$nextTick();
      state.assetId = assetId;
      await flushPromises();
      expect(state.amount).toBe('');
      expect(state.value).toBe('');
      expect(host.get('[data-testid="fiatAmount"]').text()).toBe(fiat);
    }
  });

  it('prices exactly the balance asked for, never the group price id', () => {
    const network = (name: string) => [ethereum, kusama].find((item) => item.name.toLowerCase() === name.toLowerCase());
    expect(getTransferAssetPrice(eth(), ethereum, prices)).toBe(2000);
    expect(getTransferAssetPrice(kick(), ethereum, prices)).toBeNull();
    expect(getTransferAssetPrice(untrusted(), kusama, prices)).toBeNull();
    expect(getTransferAssetPrice(eth(), ethereum, {})).toBeNull();
    expect(getTransferAssetPrice(eth(), kusama, prices)).toBeNull();
    expect(getTransferAssetPrice(eth(), network('missing'), prices)).toBeNull();
    expect(getTransferAssetPrice(undefined, ethereum, prices)).toBeNull();
    expect(getTransferAssetPrice({ symbol: 'eth' } as unknown as TokenGroup, ethereum, prices)).toBeNull();

    // A group holding a token-list ERC-20 before the utility balance: the fee is priced by the utility balance.
    const mixed = eth();
    mixed.balances.unshift(kick().balances[0]);
    expect(getTransferAssetPrice(mixed, ethereum, prices)).toBeNull();
    expect(getTransferAssetPrice(mixed, ethereum, prices, ({ isUtility }) => Boolean(isUtility))).toBe(2000);
  });
});
