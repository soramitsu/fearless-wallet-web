import { flushPromises, mount, type DOMWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isJsonValid: vi.fn() }));
vi.mock('@/extension/messaging', () => ({
  addAccount: vi.fn(),
  forgetAccount: vi.fn(),
  isDerivationPathValid: vi.fn(async () => true),
  isJsonValid: mocks.isJsonValid,
  jsonRestore: vi.fn(),
  windowOpen: vi.fn(),
  updatePairMeta: vi.fn(),
  generateMnemonic: vi.fn(),
  mnemonicValidate: vi.fn(),
  tonImportCandidates: vi.fn(),
}));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome', Wallet: 'Wallet' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [], selectedWallet: {} }) }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false, IS_SIDE_PANEL: false }));

import AddWallet from '@/screens/addWallet/AddWallet.vue';
import FInput from '@/components/FInput.vue';

// A public fixture shaped like a keyring JSON backup; nothing here is a real key.
const BACKUP = JSON.stringify({
  address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  encoded: 'public-fixture-ciphertext',
  encoding: { content: ['pkcs8', 'sr25519'], type: ['scrypt', 'xsalsa20-poly1305'], version: '3' },
  meta: { name: 'My backup' },
});

type FileInput = Omit<DOMWrapper<Element>, 'exists'>;

// As a browser does: the chosen files, then input and change events.
const select = async (input: FileInput, file?: File) => {
  (input.element as HTMLInputElement).files = (file ? [file] : []) as unknown as FileList;
  await input.trigger('input');
  await input.trigger('change');
};

const choose = async (input: FileInput, file?: File) => {
  await select(input, file);
  await flushPromises();
};

const openRestoreJson = async () => {
  const wrapper = mount(AddWallet, {
    attachTo: document.body,
    global: {
      components: { FInput },
      mocks: {
        $t: (key: string) => key,
        $i18n: { locale: 'en-EN' },
        $route: { params: { type: 'import', walletEcosystem: 'substrate' } },
        $router: { push: vi.fn() },
      },
      stubs: {
        CircleButton: true, FButton: true, NotificationPopup: true, FSelect: true, AdvancedButton: true,
        Hint: true, FCorners: { template: '<div><slot /></div>' },
      },
    },
  });
  await wrapper.setData({ typeImport: 'json' });
  await flushPromises();

  return { wrapper, input: wrapper.get('[data-testid="textFile"] input') };
};

beforeEach(() => {
  mocks.isJsonValid.mockReset();
  mocks.isJsonValid.mockResolvedValue({ value: true });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Restore JSON reads the chosen file', () => {
  it('gives the form the file text, so the backup is checked with its password', async () => {
    const { wrapper, input } = await openRestoreJson();
    expect(input.attributes('type')).toBe('file');

    await choose(input, new File([BACKUP], 'backup.json', { type: 'application/json' }));

    expect(wrapper.vm.substrateJson).toBe(BACKUP);
    expect(wrapper.vm.warningValueName).toBe('');
    expect(wrapper.vm.nickname).toBe('My backup');

    await wrapper.setData({ passwordSubstrateJson: 'fixture password' });
    await wrapper.vm.validateSuri();
    expect(mocks.isJsonValid).toHaveBeenCalledExactlyOnceWith(JSON.parse(BACKUP), 'fixture password');
    wrapper.unmount();
  });

  it('reports a file that is too large, empty or unreadable as invalid JSON, without reading a large one', async () => {
    const { wrapper, input } = await openRestoreJson();
    const large = new File(['{}'], 'large.json');
    Object.defineProperty(large, 'size', { value: 5 * 1024 * 1024 + 1 });
    const readLarge = vi.spyOn(large, 'text');
    const unreadable = new File([BACKUP], 'unreadable.json');
    vi.spyOn(unreadable, 'text').mockRejectedValue(new Error('NotReadableError'));

    for (const file of [large, new File([], 'empty.json'), unreadable]) {
      await choose(input, file);
      expect(wrapper.vm.warningValueName).toBe('jsonInvalid');
      expect((input.element as HTMLInputElement).value).toContain(file.name);

      // Closing the warning clears the field and the chooser, so the same file can be chosen again.
      await wrapper.vm.handlerCloseNotificationPopup();
      await flushPromises();
      expect(wrapper.vm.substrateJson).toBe('');
      expect((input.element as HTMLInputElement).value).toBe('');
    }
    expect(readLarge).not.toHaveBeenCalled();
    expect(mocks.isJsonValid).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('clears the field when the choice is cancelled', async () => {
    const { wrapper, input } = await openRestoreJson();
    await choose(input, new File([BACKUP], 'backup.json'));
    expect(wrapper.vm.substrateJson).toBe(BACKUP);

    await choose(input);
    expect(wrapper.vm.substrateJson).toBe('');
    expect(wrapper.vm.warningValueName).toBe('');
    wrapper.unmount();
  });

  it('keeps the latest choice when an earlier file finishes reading later', async () => {
    const { wrapper, input } = await openRestoreJson();
    let finishFirst!: (text: string) => void;
    const first = new File(['{}'], 'first.json');
    vi.spyOn(first, 'text').mockReturnValue(new Promise((resolve) => { finishFirst = resolve; }));

    await select(input, first);
    await choose(input, new File([BACKUP], 'backup.json'));
    finishFirst('{"address":"stale"}');
    await flushPromises();

    expect(wrapper.vm.substrateJson).toBe(BACKUP);
    wrapper.unmount();
  });
});
