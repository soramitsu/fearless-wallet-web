import { flushPromises, shallowMount } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilesState } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  jsonRestore: vi.fn(),
  validateJson: vi.fn(),
  selectAccount: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  universalWalletPasswordStatus: mocks.status, jsonRestore: mocks.jsonRestore, isJsonValid: mocks.validateJson,
  updateCurrentAccount: mocks.selectAccount, migrateMasterPassword: vi.fn(), addAccount: vi.fn(), forgetAccount: vi.fn(),
  isDerivationPathValid: vi.fn(), windowOpen: vi.fn(), updatePairMeta: vi.fn(), generateMnemonic: vi.fn(),
  mnemonicValidate: vi.fn(), tonImportCandidates: vi.fn(), universalWalletPasswordDiscovery: vi.fn(),
  addUniversalWalletPasswordPath: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => reactive({ accounts: [], selectedWallet: { address: '' } }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', Welcome: 'Welcome' } }));
// CJS TON dependencies and the keyring must share one Buffer implementation in the Node test runner.
vi.mock('vite-plugin-node-polyfills/shims/buffer', async () => {
  const { createRequire } = await import('node:module');
  const { Buffer } = createRequire(import.meta.url)('node:buffer');
  return { default: Buffer, Buffer };
});

import AddWallet from '@/screens/addWallet/AddWallet.vue';
import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import FinishForm from '@/screens/addWallet/FinishForm.vue';
import RestoredWalletPathForm from '@/components/RestoredWalletPathForm.vue';

const STORAGE_KEY = 'fearless:universal-wallet-password-notice:v1';
const RESTORED = '5Eqf3HjMyuHLhjZEk8uizmmF2zTsPqZy3XJENDTJuRdjMe7N';
const BACKUP = { address: RESTORED, encoded: 'e30=', encoding: { content: ['pkcs8', 'sr25519'], type: ['scrypt'], version: '3' },
  meta: { name: 'Password wallet' } };

beforeEach(() => {
  localStorage.clear();
  mocks.status.mockReset().mockResolvedValue({ state: 'path-required' });
  mocks.jsonRestore.mockReset().mockResolvedValue(RESTORED);
  mocks.validateJson.mockReset().mockResolvedValue({ value: true });
  mocks.selectAccount.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Import → JSON of a wallet whose words open its key only with its path', () => {
  const restoreJson = async () => {
    const wrapper = shallowMount(AddWallet, {
      global: {
        mocks: { $t: (key: string) => key, $route: { params: { type: 'import', walletEcosystem: 'substrate' } }, $router: { push: vi.fn() } },
        stubs: { FButton: true, Icon: true },
      },
    });
    await wrapper.setData({ typeImport: 'json', substrateJson: JSON.stringify(BACKUP), passwordSubstrateJson: 'backup password', nickname: 'Password wallet' });
    // Step 4 saves the wallet.
    await wrapper.setData({ step: 4 });
    await flushPromises();
    return wrapper;
  };

  it('asks for the path before the finish screen, which follows once it is answered', async () => {
    const wrapper = await restoreJson();

    expect(mocks.jsonRestore).toHaveBeenCalledWith(BACKUP, 'backup password', undefined);
    expect(mocks.status).toHaveBeenCalledWith(RESTORED);
    expect(wrapper.findComponent(RestoredWalletPathForm).props('address')).toBe(RESTORED);
    expect(wrapper.findComponent(FinishForm).exists()).toBe(false);
    expect(wrapper.find('[data-testid="proceedBtn"]').exists()).toBe(false);

    wrapper.findComponent(RestoredWalletPathForm).vm.$emit('done', { state: 'legacy', rows: [] });
    await flushPromises();
    expect(wrapper.findComponent(RestoredWalletPathForm).exists()).toBe(false);
    expect(wrapper.findComponent(FinishForm).exists()).toBe(true);
    expect(wrapper.find('[data-testid="proceedBtn"]').exists()).toBe(true);
    // The wallet's own screen may still show what the path left to do (its old addresses).
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    wrapper.unmount();
  });

  it('asks only once: a skipped path is not asked again by the wallet screen', async () => {
    const wrapper = await restoreJson();

    wrapper.findComponent(RestoredWalletPathForm).vm.$emit('skip');
    await flushPromises();
    expect(wrapper.findComponent(FinishForm).exists()).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([RESTORED]);
    wrapper.unmount();
  });

  it('finishes as before for a backup whose words open its key', async () => {
    mocks.status.mockResolvedValue({ state: 'none' });
    const wrapper = await restoreJson();

    expect(wrapper.findComponent(RestoredWalletPathForm).exists()).toBe(false);
    expect(wrapper.findComponent(FinishForm).exists()).toBe(true);
    wrapper.unmount();
  });

  it('finishes when the check itself fails; wallet details can still ask later', async () => {
    mocks.status.mockRejectedValue(new Error('worker restarted'));
    const wrapper = await restoreJson();

    expect(wrapper.findComponent(RestoredWalletPathForm).exists()).toBe(false);
    expect(wrapper.findComponent(FinishForm).exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Google Drive restore of such a wallet', () => {
  const restoreRow = async () => {
    const items = reactive<FilesState[]>([{ address: RESTORED, id: 'file', active: true, password: 'backup password', json: BACKUP as never }]);
    const wrapper = shallowMount(BackupWalletsList, {
      props: { isGoogle: true, items },
      attrs: { onSetItemValue: (index: number, data: Partial<FilesState>) => { items[index] = { ...items[index], ...data }; } },
      global: { mocks: { $t: (key: string) => key }, stubs: { FButton: true } },
    });
    await wrapper.vm.importFromGoogle(0);
    await flushPromises();
    return { wrapper, items };
  };

  it('asks in the row of the restored wallet, after the row is complete', async () => {
    const { wrapper, items } = await restoreRow();

    expect(items[0]).toMatchObject({ isComplete: true, restoredPathAddress: RESTORED });
    expect(wrapper.findComponent(RestoredWalletPathForm).props('address')).toBe(RESTORED);

    wrapper.findComponent(RestoredWalletPathForm).vm.$emit('done', { state: 'protected' });
    await flushPromises();
    expect(items[0].restoredPathAddress).toBe('');
    expect(wrapper.findComponent(RestoredWalletPathForm).exists()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    wrapper.unmount();
  });

  it('remembers a skipped row so the wallet screen does not ask again', async () => {
    const { wrapper, items } = await restoreRow();

    wrapper.findComponent(RestoredWalletPathForm).vm.$emit('skip');
    await flushPromises();
    expect(items[0].restoredPathAddress).toBe('');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([RESTORED]);
    wrapper.unmount();
  });

  it('asks nothing when the restore failed or the words open the key', async () => {
    mocks.selectAccount.mockRejectedValueOnce(new Error('storage failure'));
    const failed = await restoreRow();
    expect(failed.items[0].restoredPathAddress).toBeUndefined();
    expect(mocks.status).not.toHaveBeenCalled();
    failed.wrapper.unmount();

    mocks.status.mockResolvedValue({ state: 'none' });
    const plain = await restoreRow();
    expect(plain.items[0]).toMatchObject({ isComplete: true });
    expect(plain.items[0].restoredPathAddress).toBeUndefined();
    expect(plain.wrapper.findComponent(RestoredWalletPathForm).exists()).toBe(false);
    plain.wrapper.unmount();
  });
});
