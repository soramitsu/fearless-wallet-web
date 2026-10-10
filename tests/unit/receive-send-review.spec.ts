import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  wallet: { address: 'public-wallet', name: 'Test wallet' },
  balances: [] as unknown[],
  networks: [] as { name: string; assets: { symbol: string }[] }[],
}));
vi.mock('@/helpers', async (importOriginal) => ({ ...(await importOriginal<object>()), setClipboard: mocks.copy }));
vi.mock('@/helpers/numbers', async (importOriginal) => ({ ...(await importOriginal<object>()), addNumbers: () => '1.1' }));
vi.mock('@/helpers/currencies', async (importOriginal) => ({ ...(await importOriginal<object>()), getUtilityAsset: () => ({ symbol: 'DOT' }) }));
vi.mock('@/util/BaseApi', () => ({
  default: {
    isBitcoinNetwork: () => false,
    isEthereumNetwork: (network: string) => ['ethereum', 'polygon', 'moonbeam'].includes(network.toLowerCase()),
    formatAddress: (_: unknown, network: string) => `${network}-complete-public-address-0123456789abcdef`,
  },
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    selectedWallet: mocks.wallet,
    get balances() {
      return mocks.balances;
    },
    fiatSymbol: '$',
  }),
}));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({
    getNetwork: (name: string) =>
      mocks.networks.find((network) => network.name.toLowerCase() === name.toLowerCase()) ?? { assets: [] },
    getAssetPrice: () => ({ price: 0 }),
  }),
}));
vi.mock('@/consts/global', async (importOriginal) => ({ ...(await importOriginal<object>()), IS_EXTENSION: false }));
vi.mock('@/screens/wallet&asset/TransferForm.vue', () => ({ default: { template: '<section><slot name="step2" /></section>' } }));
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';

const translate = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);
const globalFor = (params: Record<string, string>) => ({
  mocks: { $t: translate, $n: (n: number) => String(n), $route: { params }, $router: { back: vi.fn() } },
  stubs: {
    AboveForm: { name: 'AboveForm', props: ['header'], template: '<main><slot /></main>' },
    QR: { props: ['payload'], template: '<div data-qr :data-payload="payload" />' },
    Alert: { template: '<div data-alert><slot /></div>' },
    InputWithIcon: true,
    SelectPopup: true,
    Icon: true,
    Tooltip: true,
    BorderButton: true,
    FButton: true,
    FInput: true,
    InfoRow: true,
    FCorners: { template: '<div><slot /></div>' },
  },
});
const global = globalFor({ network: 'Polkadot', assetId: 'dot' });

const DOT = '887a17c7-1370-4de0-97dd-5422e294fa75';
const KSM = '1e0c2ec6-935f-49bd-a854-5e12ee6c9f1b';
const DAI = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';

const group = (id: string, network: string, symbol: string, currencyId?: string) => ({
  groupId: id,
  symbol,
  tokenName: symbol,
  icon: symbol,
  priceId: symbol,
  balances: [{ id, currencyId, name: network.toLowerCase(), symbol, icon: network, isUtility: false, precision: 10 }],
});

describe('public transfer review data', () => {
  beforeEach(() => {
    mocks.balances = [];
    mocks.networks = [];
  });

  it('uses the same full selected-network address for text, copy and QR', async () => {
    const wrapper = mount(ReceiveForm, { global });
    await flushPromises();
    for (const network of ['Polkadot', 'Kusama']) {
      await wrapper.setData({ selectedNetwork: network });
      const address = `${network}-complete-public-address-0123456789abcdef`;
      expect(wrapper.get('.full-address').text()).toBe(address);
      expect(wrapper.get('[data-qr]').attributes('data-payload')).toBe(address);
      const copy = wrapper.get('button[data-testid="copyAddress"]');
      expect(copy.attributes('aria-label')).toBe('common.copyToClipboard');
      await copy.trigger('click');
      expect(mocks.copy).toHaveBeenLastCalledWith(address);
    }
    wrapper.unmount();
  });
  it('shows every recipient character and destination network in Send confirmation', async () => {
    const wrapper = mount(SendForm, { global });
    const recipient = '1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    await wrapper.setData({ recipient, selectedNetwork: 'Destination network with a long name' });
    expect(wrapper.get('[data-testid="toAddress"]').text()).toBe(recipient);
    expect(wrapper.get('[data-testid="reviewNetwork"]').text()).toBe('Destination network with a long name');
    wrapper.unmount();
  });
});

describe('network-explicit Receive', () => {
  beforeEach(() => {
    mocks.networks = [
      { name: 'Ethereum', assets: [{ symbol: 'eth' }] },
      { name: 'Polkadot', assets: [{ symbol: 'dot' }] },
      { name: 'Polkadot AssetHub', assets: [{ symbol: 'dot' }] },
      { name: 'Kusama', assets: [{ symbol: 'ksm' }] },
      { name: 'Kusama AssetHub', assets: [{ symbol: 'ksm' }] },
      { name: 'Encointer on Kusama', assets: [{ symbol: 'ksm' }] },
      { name: 'Moonbeam', assets: [{ symbol: 'glmr' }] },
    ];
    mocks.balances = [
      group('usdt-eth', 'Ethereum', 'usdt'),
      group(DOT, 'Polkadot', 'dot'),
      group(DOT, 'Polkadot AssetHub', 'dot'),
      group('usdt-assethub', 'Polkadot AssetHub', 'usdt', '1984'),
      group(KSM, 'Kusama', 'ksm'),
      group(KSM, 'Kusama AssetHub', 'ksm'),
      group(KSM, 'Encointer on Kusama', 'ksm'),
      group('xcdot-moonbeam', 'Moonbeam', 'xcDOT'),
    ];
  });

  it('names the asset and network in the title, chip and warning, with the EVM note', async () => {
    const wrapper = mount(ReceiveForm, { global: globalFor({ assetId: 'usdt-eth', network: 'Ethereum' }) });
    await flushPromises();

    expect(wrapper.getComponent({ name: 'AboveForm' }).props('header')).toEqual({
      text: 'assets.receiveTokenTitle',
      localeProps: { symbol: 'USDT' },
    });
    expect(wrapper.get('[data-testid="receiveNetworkChip"]').text()).toBe('assets.onNetwork {"network":"Ethereum"}');

    const warning = wrapper.get('[data-testid="receiveOnlyOnNetwork"]').text();
    expect(warning).toContain('assets.receiveOnlyOnNetwork');
    expect(warning).toContain('"symbol":"USDT"');
    expect(warning).toContain('"network":"Ethereum"');
    expect(wrapper.find('[data-testid="receiveEvmSameAddress"]').exists()).toBe(true);
    // The warning sits under the QR code.
    expect(wrapper.get('[data-qr]').element.compareDocumentPosition(wrapper.get('[data-alert]').element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    wrapper.unmount();
  });

  it('drops the EVM note on Substrate networks and recomputes on a network switch', async () => {
    const wrapper = mount(ReceiveForm, { global: globalFor({ assetId: DOT, network: 'Polkadot AssetHub' }) });
    await flushPromises();
    await wrapper.setData({ selectedNetwork: 'Polkadot' });

    expect(wrapper.get('[data-testid="receiveOnlyOnNetwork"]').text()).toContain('"network":"Polkadot"');
    expect(wrapper.get('[data-testid="receiveOnlyOnNetwork"]').text()).toContain('"symbol":"DOT"');
    expect(wrapper.find('[data-testid="receiveEvmSameAddress"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('lists every network holding the same registry asset, also when opened from AssetHub', async () => {
    const wrapper = mount(ReceiveForm, { global: globalFor({ assetId: KSM, network: 'Kusama AssetHub' }) });
    await flushPromises();

    const names = (wrapper.vm as unknown as { assetNetworks: { name: string }[] }).assetNetworks.map(({ name }) => name);
    expect(names).toEqual(['Kusama', 'Kusama AssetHub', 'Encointer on Kusama']);
    wrapper.unmount();
  });

  it('resolves the canonical id from the portfolio without offering unrelated networks', async () => {
    const wrapper = mount(ReceiveForm, { global: globalFor({ assetId: '1984', network: 'Polkadot AssetHub' }) });
    await flushPromises();

    const vm = wrapper.vm as unknown as { receiveSymbol: string; assetNetworks: { name: string }[] };
    expect(vm.receiveSymbol).toBe('USDT');
    expect(vm.assetNetworks.map(({ name }) => name)).toEqual(['Polkadot AssetHub']);
    wrapper.unmount();
  });

  it('names the network utility token when the asset is not on the selected network', async () => {
    const wrapper = mount(ReceiveForm, { global: globalFor({ assetId: 'usdt-eth', network: 'Ethereum' }) });
    await flushPromises();
    await wrapper.setData({ selectedNetwork: 'Kusama' });

    expect(wrapper.get('[data-testid="receiveOnlyOnNetwork"]').text()).toContain('"symbol":"KSM"');
    expect(wrapper.get('[data-testid="receiveOnlyOnNetwork"]').text()).toContain('"network":"Kusama"');
    wrapper.unmount();
  });

  it('shows the native ticker for xc assets on Substrate EVM networks', async () => {
    const wrapper = mount(ReceiveForm, { global: globalFor({ assetId: 'xcdot-moonbeam', network: 'Moonbeam' }) });
    await flushPromises();

    expect(wrapper.get('[data-testid="receiveOnlyOnNetwork"]').text()).toContain('"symbol":"DOT"');
    expect(wrapper.find('[data-testid="receiveEvmSameAddress"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('network-explicit Send confirmation', () => {
  beforeEach(() => {
    mocks.networks = [
      { name: 'Arbitrum One', assets: [{ symbol: 'eth' }] },
      { name: 'OP Mainnet', assets: [{ symbol: 'eth' }] },
      { name: 'Polkadot AssetHub', assets: [{ symbol: 'dot' }] },
    ];
    mocks.balances = [
      group(DAI, 'Arbitrum One', 'dai'),
      group(DAI, 'OP Mainnet', 'dai'),
      group('usdt-assethub', 'Polkadot AssetHub', 'usdt', '1984'),
    ];
  });

  it('puts the Network row first and resolves the asset on that network', async () => {
    const wrapper = mount(SendForm, { global: globalFor({ assetId: DAI, network: 'op mainnet' }) });
    await flushPromises();

    const rows = wrapper.findAll('.row');
    expect(rows[0].attributes('data-testid')).toBe('reviewNetworkRow');
    expect(rows[0].text()).toContain('common.network');
    expect(wrapper.get('[data-testid="reviewNetwork"]').text()).toBe('OP Mainnet');
    expect((wrapper.vm as unknown as { currency: { balances: { name: string }[] } }).currency.balances[0].name).toBe(
      'op mainnet'
    );
    wrapper.unmount();
  });

  it('shows the asset symbol when opened with the portfolio canonical id', async () => {
    const wrapper = mount(SendForm, { global: globalFor({ assetId: '1984', network: 'Polkadot AssetHub' }) });
    await flushPromises();

    expect((wrapper.vm as unknown as { selectedAssetUpper: string }).selectedAssetUpper).toBe('USDT');
    wrapper.unmount();
  });
});
