import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const OLD = '5EPCUjPxiHAcNooYipQFWr9NmmXJKpNG5RhcntXwbtUySrgH';
const NEW = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const STRANGER = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  wallet: { address: '', name: 'Wallet' },
}));
vi.mock('@/extension/messaging/legacy-exposure', () => ({ getLegacyExposureStatus: mocks.status }));
vi.mock('@/util/BaseApi', () => ({
  default: {
    isBitcoinNetwork: () => false,
    isEthereumNetwork: () => false,
    isSolanaNetwork: () => false,
    validateAddress: (address: string) => address.startsWith('polkadot:'),
    formatAddress: ({ address }: { address: string }, network: string) => `${network.toLowerCase()}:${address}`,
  },
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    selectedWallet: mocks.wallet,
    accounts: [
      { address: OLD, ethereumAddress: '', walletEcosystem: 'substrate' },
      { address: NEW, ethereumAddress: '', walletEcosystem: 'substrate' },
    ],
    balances: [],
    fiatSymbol: '$',
  }),
}));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({ getNetwork: () => ({ assets: [] }), getAssetPrice: () => ({ price: 0 }) }),
}));
vi.mock('@/consts/global', async (importOriginal) => ({ ...(await importOriginal<object>()), IS_EXTENSION: false }));
vi.mock('@/screens/wallet&asset/TransferForm.vue', () => ({
  default: { name: 'TransferForm', props: ['recipient'], template: '<section :data-recipient="recipient" />' },
}));

import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';

const globalFor = (params: Record<string, string>, query: Record<string, string> = {}) => ({
  mocks: {
    $t: (key: string) => key,
    $n: (value: number) => String(value),
    $route: { params, query },
    $router: { back: vi.fn() },
  },
  stubs: {
    AboveForm: { template: '<main><slot /></main>' },
    QR: true,
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

const acknowledged = {
  state: 'acknowledged',
  wallets: [{ address: OLD, walletEcosystem: 'substrate', name: 'Old', present: true }],
  newWallets: [{ address: NEW, walletEcosystem: 'substrate', name: 'New' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue(acknowledged);
});

describe('Send opened from the security notice guide', () => {
  it("fills in the new wallet's address for the network", () => {
    const wrapper = mount(SendForm, { global: globalFor({ assetId: 'dot', network: 'Polkadot' }, { to: NEW }) });

    expect(wrapper.getComponent({ name: 'TransferForm' }).props('recipient')).toBe(`polkadot:${NEW}`);
  });

  it('fills in nothing for an address that is not one of the user’s wallets, or without one', () => {
    for (const query of [{ to: STRANGER }, {}]) {
      const wrapper = mount(SendForm, { global: globalFor({ assetId: 'dot', network: 'Polkadot' }, query) });

      expect(wrapper.getComponent({ name: 'TransferForm' }).props('recipient')).toBe('');
    }
  });
});

describe('Receive on a wallet from before the update', () => {
  it('warns before the address of an old wallet', async () => {
    mocks.wallet.address = OLD;
    const wrapper = mount(ReceiveForm, { global: globalFor({ assetId: 'dot', network: 'Polkadot' }) });
    await flushPromises();

    expect(wrapper.get('[data-testid="receiveExposedWallet"]').text()).toBe('exposureNotice.receiveWarning');
  });

  it('does not warn on a new wallet, or when the background cannot answer', async () => {
    mocks.wallet.address = NEW;
    const fresh = mount(ReceiveForm, { global: globalFor({ assetId: 'dot', network: 'Polkadot' }) });
    await flushPromises();
    expect(fresh.find('[data-testid="receiveExposedWallet"]').exists()).toBe(false);

    mocks.wallet.address = OLD;
    mocks.status.mockRejectedValue(new Error('port closed'));
    const unknown = mount(ReceiveForm, { global: globalFor({ assetId: 'dot', network: 'Polkadot' }) });
    await flushPromises();
    expect(unknown.find('[data-testid="receiveExposedWallet"]').exists()).toBe(false);
  });
});
