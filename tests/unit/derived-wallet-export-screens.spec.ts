import { flushPromises, mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportMnemonic: vi.fn(), exportRowSeed: vi.fn(),
  wallet: {} as Record<string, unknown>,
}));
vi.mock('@/extension/messaging', () => ({ exportMnemonic: mocks.exportMnemonic, exportRowSeed: mocks.exportRowSeed, exportJSON: vi.fn() }));
vi.mock('@/helpers', () => ({ isSameString: (left: string, right: string) => left === right, setClipboard: vi.fn() }));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: mocks.wallet }) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ networks: [] }) }));
vi.mock('@/util/BaseApi', () => ({ default: { isEthereumNetwork: () => false, formatAddress: () => 'public-formatted' } }));
vi.mock('@/router/routes', () => ({ Components: { AccountAccessRecovery: 'AccountAccessRecovery' } }));

import ExportForm from '@/screens/accounts/ExportForm.vue';
import ExportTypeForm from '@/screens/accounts/ExportTypeForm.vue';
import { derivedWalletExportMessages } from '@/locales/derivedWalletExport';

const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const rows = (wrapper: VueWrapper) => wrapper.findAll('button').map((button) => button.text());

async function choices() {
  const wrapper = mount(ExportTypeForm, { props: { password: 'public password' }, global: {
    mocks: { $t: (key: string) => key },
    stubs: { InfoRow: { props: ['text'], emits: ['click'], template: '<button @click="$emit(\'click\')">{{ text }}</button>' } },
  } });
  await flushPromises();
  return wrapper;
}

async function exportPhrase(response: { seed: string; restoresOtherAccount?: boolean }, locale = 'en-EN') {
  mocks.exportMnemonic.mockResolvedValue(response);
  const wrapper = shallowMount(ExportForm, {
    props: { password: 'public password', exportType: 'mnemonic' },
    global: {
      mocks: { $t: (key: string) => key, $route: { params: {} }, $i18n: { locale } },
      stubs: { Loader: true, FInput: true, FButton: true, Hint: true, MnemonicBackupForm: { template: '<div><slot /></div>' } },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.wallet = { address: 'public-wallet', walletEcosystem: 'substrate', isMasterAccount: true };
});

describe('export choices for a wallet made with a derivation path or password', () => {
  it('does not offer the raw seed the background refuses', async () => {
    mocks.exportRowSeed.mockRejectedValue(new Error('This wallet was made with a derivation path or password.'));
    const wrapper = await choices();

    expect(mocks.exportRowSeed).toHaveBeenCalledExactlyOnceWith('public-wallet', 'public password', false);
    expect(rows(wrapper)).toEqual(['accounts.mnemonic', 'accounts.json']);
  });

  it('offers the raw seed once the background has exported it', async () => {
    mocks.exportRowSeed.mockResolvedValue({ seed: `0x${'11'.repeat(32)}` });

    expect(rows(await choices())).toEqual(['accounts.mnemonic', 'accounts.rawSeed', 'accounts.json']);
  });
});

describe('mnemonic export of a wallet made with a derivation path or password', () => {
  it.each(['en-EN', 'ru-RU'] as const)('says the phrase alone restores another account (%s)', async (locale) => {
    const wrapper = await exportPhrase({ seed: PHRASE, restoresOtherAccount: true }, locale);

    expect(wrapper.get('[data-testid="phraseRestoresOtherAccount"]').text())
      .toBe(derivedWalletExportMessages[locale].restoresOtherAccount);
  });

  it('adds nothing when the phrase opens the wallet', async () => {
    const wrapper = await exportPhrase({ seed: PHRASE });

    expect(wrapper.find('[data-testid="phraseRestoresOtherAccount"]').exists()).toBe(false);
  });
});
