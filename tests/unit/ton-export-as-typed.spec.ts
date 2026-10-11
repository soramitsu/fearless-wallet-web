import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exportMnemonic: vi.fn(), setClipboard: vi.fn(), wallet: { address: '', walletEcosystem: '' } }));
vi.mock('@/extension/messaging', () => ({ exportMnemonic: mocks.exportMnemonic, exportJSON: vi.fn(), exportRowSeed: vi.fn() }));
vi.mock('@/helpers', () => ({ isSameString: (left: string, right: string) => left === right, setClipboard: mocks.setClipboard }));
vi.mock('@/helpers/files', () => ({ downloadJsonAccount: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: mocks.wallet }) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ networks: [] }) }));
vi.mock('@/util/BaseApi', () => ({ default: { isEthereumNetwork: () => false, formatAddress: () => '' } }));
// ExportForm links a failed export to Account access (WK-3); the route table would pull in the whole router.
vi.mock('@/router/routes', () => ({ Components: { AccountAccessRecovery: 'AccountAccessRecovery' } }));

import androidVectors from '../fixtures/ton/ton-android-4.2.0-vectors.json';
import bip39Vectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import ExportForm from '@/screens/accounts/ExportForm.vue';

const [legacy305] = bip39Vectors.vectors;
const asTyped = androidVectors.vectors.find(({ variant }) => variant === 'double-space')!;

async function exportPhrase(seed: string, walletEcosystem = 'ton') {
  mocks.wallet = { address: 'UQ-fixture', walletEcosystem };
  mocks.exportMnemonic.mockResolvedValue({ seed });
  const wrapper = shallowMount(ExportForm, {
    props: { password: 'master password', exportType: 'mnemonic' },
    global: {
      mocks: { $t: (key: string) => key, $route: { params: {} } },
      stubs: {
        Loader: true,
        FInput: true,
        FButton: { emits: ['click'], template: '<button data-testid="exportBtn" @click="$emit(\'click\')" />' },
        Hint: { props: ['text'], template: '<p>{{ text }}</p>' },
        MnemonicBackupForm: { template: '<div><slot /></div>' },
      },
    },
  });
  await flushPromises();

  return wrapper;
}

beforeEach(() => vi.clearAllMocks());

describe('Exporting a TON phrase that only works as typed', () => {
  it('says so and copies the phrase exactly as stored', async () => {
    const wrapper = await exportPhrase(asTyped.typedText);

    expect(wrapper.find('[data-testid="tonPhraseAsTyped"]').text()).toBe('ux.tonPhraseAsTyped');
    await wrapper.find('[data-testid="exportBtn"]').trigger('click');
    expect(mocks.setClipboard).toHaveBeenCalledWith(asTyped.typedText);
    wrapper.unmount();
  });

  it('adds nothing for a phrase stored the usual way, or for other networks', async () => {
    for (const [seed, walletEcosystem] of [
      [legacy305.mnemonic, 'ton'],
      [`${legacy305.mnemonic} `, 'substrate'],
    ]) {
      const wrapper = await exportPhrase(seed, walletEcosystem);

      expect(wrapper.find('[data-testid="tonPhraseAsTyped"]').exists()).toBe(false);
      wrapper.unmount();
    }
  });
});
