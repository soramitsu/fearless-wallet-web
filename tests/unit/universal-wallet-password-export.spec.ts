import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportMnemonic: vi.fn(),
  status: vi.fn(),
  wallet: { address: '5PasswordWallet', walletEcosystem: 'substrate' },
}));
vi.mock('@/extension/messaging', () => ({
  exportMnemonic: mocks.exportMnemonic,
  exportJSON: vi.fn(),
  exportRowSeed: vi.fn(),
  universalWalletPasswordStatus: mocks.status,
}));
vi.mock('@/helpers', () => ({ isSameString: (left: string, right: string) => left === right, setClipboard: vi.fn() }));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: mocks.wallet }) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ networks: [] }) }));
vi.mock('@/util/BaseApi', () => ({ default: { isEthereumNetwork: () => false, formatAddress: () => '' } }));
vi.mock('@/router/routes', () => ({ Components: { AccountAccessRecovery: 'AccountAccessRecovery' } }));

import ExportForm from '@/screens/accounts/ExportForm.vue';

const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function exportPhrase() {
  const wrapper = shallowMount(ExportForm, {
    props: { password: 'master password', exportType: 'mnemonic' },
    global: {
      mocks: { $t: (key: string) => key, $route: { params: {} } },
      stubs: {
        Loader: true,
        FInput: true,
        FButton: true,
        Hint: { props: ['text'], template: '<p>{{ text }}</p>' },
        MnemonicBackupForm: { template: '<div><slot /></div>' },
      },
    },
  });
  await flushPromises();

  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exportMnemonic.mockResolvedValue({ seed: PHRASE });
});

describe('Exporting the words of a wallet with a password', () => {
  it.each(['protected', 'legacy'])('says the %s wallet also needs its password', async (state) => {
    mocks.status.mockResolvedValue(state === 'legacy' ? { state, rows: [] } : { state });
    const wrapper = await exportPhrase();

    expect(mocks.status).toHaveBeenCalledWith('5PasswordWallet');
    expect(wrapper.find('[data-testid="universalWalletPasswordBackup"]').text()).toBe('ux.universalWalletPasswordBackup');
    wrapper.unmount();
  });

  it('adds nothing when the words alone restore every account, or the status is unavailable', async () => {
    for (const answer of [
      () => Promise.resolve({ state: 'none' }),
      () => Promise.resolve({ state: 'password-unknown' }),
      () => Promise.reject(new Error('locked')),
    ]) {
      mocks.status.mockImplementationOnce(answer);
      const wrapper = await exportPhrase();

      expect(wrapper.find('[data-testid="universalWalletPasswordBackup"]').exists()).toBe(false);
      wrapper.unmount();
    }
  });
});
