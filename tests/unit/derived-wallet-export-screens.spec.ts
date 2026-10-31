import { flushPromises, mount, shallowMount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';

const mocks = vi.hoisted(() => ({
  exportMnemonic: vi.fn(), exportRowSeed: vi.fn(), rawSeedAvailable: vi.fn(),
  store: { selectedWallet: {} as Record<string, unknown> },
}));
vi.mock('@/extension/messaging', () => ({
  exportMnemonic: mocks.exportMnemonic, exportRowSeed: mocks.exportRowSeed, rawSeedAvailable: mocks.rawSeedAvailable, exportJSON: vi.fn(),
}));
vi.mock('@/helpers', () => ({ isSameString: (left: string, right: string) => left === right, setClipboard: vi.fn() }));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: vi.fn() }));
vi.mock('@/stores/accounts', async () => {
  const { reactive } = await import('vue');
  mocks.store = reactive(mocks.store);
  return { useAccountsStore: () => mocks.store };
});
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ networks: [] }) }));
vi.mock('@/util/BaseApi', () => ({ default: { isEthereumNetwork: () => false, formatAddress: () => 'public-formatted' } }));
vi.mock('@/router/routes', () => ({ Components: { AccountAccessRecovery: 'AccountAccessRecovery' } }));

import ExportForm from '@/screens/accounts/ExportForm.vue';
import ExportTypeForm from '@/screens/accounts/ExportTypeForm.vue';
import { derivedWalletExportMessages } from '@/locales/derivedWalletExport';

const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
const verified = (address: string) => ({ address, walletEcosystem: 'substrate', isMasterAccount: true });
const rows = (wrapper: VueWrapper) => wrapper.findAll('button').map((button) => button.text());
const global = {
  mocks: { $t: (key: string) => key },
  stubs: { InfoRow: { props: ['text'], emits: ['click'], template: '<button @click="$emit(\'click\')">{{ text }}</button>' } },
};

async function choices() {
  const wrapper = mount(ExportTypeForm, { props: { password: 'public password' }, global });
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
  mocks.store.selectedWallet = verified('public-wallet');
});

describe('export choices for a wallet made with a derivation path or password', () => {
  it('does not offer the raw seed when the background answers that it opens another account', async () => {
    mocks.rawSeedAvailable.mockResolvedValue(false);
    const wrapper = await choices();

    expect(mocks.rawSeedAvailable).toHaveBeenCalledExactlyOnceWith('public-wallet', 'public password');
    expect(rows(wrapper)).toEqual(['accounts.mnemonic', 'accounts.json']);
    expect(mocks.exportRowSeed).not.toHaveBeenCalled();
  });

  it('offers the raw seed when the background answers that it opens this wallet, without fetching it', async () => {
    mocks.rawSeedAvailable.mockResolvedValue(true);

    expect(rows(await choices())).toEqual(['accounts.mnemonic', 'accounts.rawSeed', 'accounts.json']);
    expect(mocks.exportRowSeed).not.toHaveBeenCalled();
  });

  it('drops the answer when another wallet is selected and never asks with the password for it', async () => {
    mocks.rawSeedAvailable.mockResolvedValue(true);
    const wrapper = await choices();
    mocks.store.selectedWallet = verified('public-other-wallet');
    await flushPromises();

    expect(rows(wrapper)).toEqual(['accounts.mnemonic', 'accounts.json']);
    expect(mocks.rawSeedAvailable).toHaveBeenCalledOnce();
  });

  it('ignores an answer that arrives after another wallet was selected', async () => {
    let answer!: (available: boolean) => void;
    mocks.rawSeedAvailable.mockReturnValue(new Promise<boolean>((resolve) => { answer = resolve; }));
    const wrapper = mount(ExportTypeForm, { props: { password: 'public password' }, global });
    mocks.store.selectedWallet = verified('public-other-wallet');
    await nextTick();
    answer(true);
    await flushPromises();

    expect(rows(wrapper)).toEqual(['accounts.mnemonic', 'accounts.json']);
  });

  it('drops the answer when the screen is left', async () => {
    mocks.rawSeedAvailable.mockResolvedValue(true);
    const shown = ref(true);
    const Screen = defineComponent({ components: { ExportTypeForm }, setup: () => ({ shown }),
      template: '<KeepAlive><ExportTypeForm v-if="shown" password="public password" /></KeepAlive>' });
    const wrapper = mount(Screen, { global });
    await flushPromises();
    expect(rows(wrapper)).toEqual(['accounts.mnemonic', 'accounts.rawSeed', 'accounts.json']);

    shown.value = false;
    await flushPromises();
    shown.value = true;
    await flushPromises();

    expect(rows(wrapper)).toEqual(['accounts.mnemonic', 'accounts.json']);
    expect(mocks.rawSeedAvailable).toHaveBeenCalledOnce();
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
