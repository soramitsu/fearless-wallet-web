import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Since E2 the background answers an export of a key that waits for a password with a stable code
// instead of { seed: '' }. The export screen must say so and offer the way out.
const mocks = vi.hoisted(() => ({
  exportMnemonic: vi.fn(),
  exportRowSeed: vi.fn(),
  exportJSON: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/extension/messaging', () => ({
  exportMnemonic: mocks.exportMnemonic,
  exportRowSeed: mocks.exportRowSeed,
  exportJSON: mocks.exportJSON,
  sendMessage: vi.fn(),
}));
vi.mock('@/router/routes', () => ({ Components: { AccountAccessRecovery: 'AccountAccessRecovery' } }));

import ExportForm from '@/screens/accounts/ExportForm.vue';
import { useAccountsStore } from '@/stores/accounts';
import { WalletEcosystem } from '@/interfaces';

const SUBSTRATE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const ETHEREUM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const TON = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';

function mountExport(exportType: 'mnemonic' | 'rawSeed' | 'json', network = 'Polkadot') {
  const errors: unknown[] = [];
  const wrapper = mount(ExportForm, {
    props: { password: 'current master password', exportType },
    global: {
      config: { errorHandler: (error) => errors.push(error) },
      mocks: { $t: (key: string) => key, $route: { params: { network } }, $router: { push: mocks.push } },
      stubs: {
        Loader: { template: '<div data-testid="loader" />' },
        MnemonicBackupForm: true,
        FInput: true,
        FButton: {
          props: ['text'],
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\')">{{ text }}</button>',
        },
      },
    },
  });

  return { wrapper, errors };
}

function selectWallet(walletEcosystem: WalletEcosystem, address = SUBSTRATE) {
  const accounts = useAccountsStore();
  accounts.selectedWallet = {
    ...accounts.selectedWallet,
    address,
    ethereumAddress: ETHEREUM,
    walletEcosystem,
  } as never;
}

describe('export of a key that waits for a password', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it.each([
    ['ton_seed_needs_previous_password', WalletEcosystem.Ton, TON, 'accountAccess.previousPasswordRequired'],
    ['previous_password_required', WalletEcosystem.Substrate, SUBSTRATE, 'accountAccess.previousPasswordRequired'],
    ['legacy_password_required', WalletEcosystem.Substrate, SUBSTRATE, 'migration.legacyPasswordRequired'],
  ])(
    '%s: stops loading, explains, and opens Account access for that account',
    async (code, walletEcosystem, address, message) => {
      selectWallet(walletEcosystem, address);
      mocks.exportMnemonic.mockRejectedValue(new Error(code));
      const { wrapper, errors } = mountExport('mnemonic');
      await flushPromises();

      expect(wrapper.find('[data-testid="loader"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="exportError"]').text()).toBe(message);
      expect(wrapper.find('[data-testid="exportBtn"]').exists()).toBe(false);
      expect(errors).toEqual([]);

      await wrapper.get('[data-testid="unlockAccountBtn"]').trigger('click');
      expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
        name: 'AccountAccessRecovery',
        query: { address, ecosystem: walletEcosystem },
      });

      await wrapper.get('[data-testid="exportBackBtn"]').trigger('click');
      expect(wrapper.emitted('closeHandler')).toHaveLength(1);
    }
  );

  it('scopes an EVM private-key export to the Ethereum account', async () => {
    selectWallet(WalletEcosystem.Substrate);
    mocks.exportRowSeed.mockRejectedValue(new Error('legacy_password_required'));
    const { wrapper } = mountExport('rawSeed', 'Ethereum');
    await flushPromises();

    expect(mocks.exportRowSeed).toHaveBeenCalledWith(ETHEREUM, 'current master password', true);
    expect(wrapper.get('[data-testid="exportError"]').text()).toBe('migration.legacyPasswordRequired');
    await wrapper.get('[data-testid="unlockAccountBtn"]').trigger('click');
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
      name: 'AccountAccessRecovery',
      query: { address: ETHEREUM, ecosystem: WalletEcosystem.Evm },
    });
  });

  it('offers Back for any other failure, without pretending an unlock would help', async () => {
    selectWallet(WalletEcosystem.Substrate);
    mocks.exportJSON.mockRejectedValue(new Error('Unable to decode using the supplied passphrase'));
    const { wrapper, errors } = mountExport('json');
    await flushPromises();

    expect(wrapper.find('[data-testid="loader"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="exportError"]').text()).toBe('accounts.exportFailed');
    expect(wrapper.find('[data-testid="unlockAccountBtn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="exportBackBtn"]').exists()).toBe(true);
    expect(errors).toEqual([]);
  });

  it('still shows the phrase when the export succeeds', async () => {
    selectWallet(WalletEcosystem.Substrate);
    mocks.exportMnemonic.mockResolvedValue({ seed: 'one two three' });
    const { wrapper } = mountExport('mnemonic');
    await flushPromises();

    expect(wrapper.find('[data-testid="exportError"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'MnemonicBackupForm' }).props('mnemonicArray')).toEqual([
      'one',
      'two',
      'three',
    ]);
  });
});
