import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ addAccount: vi.fn(), jsonRestore: vi.fn() }));
vi.mock('@/extension/messaging', () => ({
  addAccount: mocks.addAccount,
  forgetAccount: vi.fn(),
  isDerivationPathValid: vi.fn(async () => true),
  isJsonValid: vi.fn(async () => ({ value: true })),
  jsonRestore: mocks.jsonRestore,
  windowOpen: vi.fn(),
  updatePairMeta: vi.fn(),
  generateMnemonic: vi.fn(),
  mnemonicValidate: vi.fn(async () => true),
  tonImportCandidates: vi.fn(),
}));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome', Wallet: 'Wallet' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [], selectedWallet: {} }) }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false, IS_SIDE_PANEL: false }));

import AddWallet from '@/screens/addWallet/AddWallet.vue';

// Public fixtures; none of them is a real key.
const SUBSTRATE_SEED = `0x${'11'.repeat(32)}`;
const ETHEREUM_SEED = `0x${'22'.repeat(32)}`;
const SUBSTRATE_JSON = JSON.stringify({ address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', encoded: 'a', encoding: {}, meta: { name: 'Backup' } });
const ETHEREUM_JSON = JSON.stringify({ address: `0x${'33'.repeat(20)}`, encoded: 'b', encoding: {}, meta: {} });

const mountImport = () =>
  shallowMount(AddWallet, {
    global: {
      mocks: {
        $t: (key: string) => key,
        $i18n: { locale: 'en-EN' },
        $route: { params: { type: 'import', walletEcosystem: 'substrate' } },
        $router: { push: vi.fn() },
      },
      stubs: { CircleButton: true, FButton: true, NotificationPopup: true },
    },
  });

// Continue to the "Add an Ethereum account?" question, answer Yes, enter the Ethereum account,
// go Back, Continue again and answer "Don't need".
const declineAfterBack = async (wrapper: ReturnType<typeof mountImport>, ethereum: Record<string, string>) => {
  await wrapper.vm.proceed();
  await flushPromises();
  expect(wrapper.vm.showAddEthereumAccountPopup).toBe(true);
  wrapper.vm.handlerAgree();
  await flushPromises();
  await wrapper.setData(ethereum);
  wrapper.vm.back();
  await flushPromises();
  expect(wrapper.vm.step).toBe(1);
  await wrapper.vm.proceed();
  await flushPromises();
  expect(wrapper.vm.showAddEthereumAccountPopup).toBe(true);
  wrapper.vm.closeAddEthereumAccountPopup();
  await flushPromises();
  expect(wrapper.vm.step).toBe(3);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.addAccount.mockImplementation(async (_suri: string, type: string) => (type === 'ethereum' ? '0xEth' : '5Sub'));
  mocks.jsonRestore.mockImplementation(async (file: { address: string }) => file.address);
});

describe('Import: "Don\'t need" an Ethereum account after entering one and going Back', () => {
  it('imports only the Substrate raw seed, with no Ethereum account linked', async () => {
    const wrapper = mountImport();
    await wrapper.setData({ typeImport: 'rawSeed', substrateRawSeed: SUBSTRATE_SEED });
    await declineAfterBack(wrapper, { ethereumRawSeed: ETHEREUM_SEED });

    await wrapper.setData({ nickname: 'Substrate only' });
    await wrapper.vm.proceed();
    await flushPromises();

    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(mocks.addAccount).toHaveBeenCalledOnce();
    const [suri, type, meta] = mocks.addAccount.mock.calls[0];
    expect([suri, type, meta.ethereumAddress]).toEqual([SUBSTRATE_SEED, 'sr25519', '']);
    wrapper.unmount();
  });

  it('restores only the Substrate JSON, with no Ethereum account linked', async () => {
    const wrapper = mountImport();
    await wrapper.setData({ typeImport: 'json', substrateJson: SUBSTRATE_JSON, passwordSubstrateJson: 'fixture password' });
    await declineAfterBack(wrapper, { ethereumJson: ETHEREUM_JSON, passwordEthereumJson: 'fixture password' });

    await wrapper.vm.proceed();
    await flushPromises();

    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(mocks.jsonRestore).toHaveBeenCalledExactlyOnceWith(JSON.parse(SUBSTRATE_JSON), 'fixture password', undefined);
    wrapper.unmount();
  });
});
