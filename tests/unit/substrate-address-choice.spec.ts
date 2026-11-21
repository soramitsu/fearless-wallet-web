import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(), validate: vi.fn(), save: vi.fn(), derive: vi.fn(), push: vi.fn(), generate: vi.fn(), discovery: vi.fn(),
}));
vi.mock('@/extension/messaging', () => ({
  substratePasswordAccounts: mocks.accounts,
  tonImportCandidates: vi.fn(),
  universalWalletPasswordDiscovery: mocks.discovery,
  mnemonicValidate: mocks.validate,
  addAccount: mocks.save,
  generateMnemonic: mocks.generate,
  isDerivationPathValid: async () => true,
  isJsonValid: async () => ({ value: true }),
  forgetAccount: vi.fn(),
  jsonRestore: vi.fn(),
  windowOpen: vi.fn(),
  updatePairMeta: vi.fn(),
}));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome', Wallet: 'Wallet' } }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [], selectedWallet: {} }) }));
vi.mock('@/util/universalWalletKeyringFields', () => ({ deriveUniversalWalletKeyringFields: mocks.derive }));
vi.mock('@/util/BaseApi', () => ({ default: {
  parseJson: () => ({}), isValidSequenceMnemonic: () => true, isValidEthereumDerivationPath: () => true,
} }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false, IS_SIDE_PANEL: false }));

import type { SubstratePasswordAccountInfo } from '@extension-base/background/types/types';
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import SubstrateAddressChoice from '@/screens/addWallet/SubstrateAddressChoice.vue';

const WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const PATH = '//polkadot///pässwörd ＦＷ';
const CURRENT = '5Current-all-fearless-apps';
const EARLIER = '5Earlier-browser-extension';
const both: SubstratePasswordAccountInfo[] = [{ rule: 'nfkd', address: CURRENT }, { rule: 'nfc', address: EARLIER }];

const mountWallet = (type: 'import' | 'create') =>
  shallowMount(AddWallet, {
    global: {
      mocks: {
        $t: (key: string) => key,
        $i18n: { locale: 'en-EN' },
        $route: { params: { type, walletEcosystem: 'substrate' } },
        $router: { push: mocks.push },
      },
      stubs: { CircleButton: true, FButton: true, NotificationPopup: true, SubstrateAddressChoice: false },
    },
  });
type Wallet = ReturnType<typeof mountWallet>;
const choiceShown = (wrapper: Wallet) => wrapper.findComponent(SubstrateAddressChoice).exists();
const pick = (wrapper: Wallet, rule: string) => wrapper.find(`[data-testid="substrateAddress-${rule}"]`).trigger('click');
const paths = (substrate: string) => ({
  substrate: { value: substrate, keypairType: 'sr25519' },
  ethereum: { value: '', keypairType: 'ethereum' },
});

async function enterWords(wrapper: Wallet, path = PATH) {
  await wrapper.setData({ mnemonic: WORDS, derivationPaths: paths(path) });
  await wrapper.vm.proceed();
  await flushPromises();
}

async function proceed(wrapper: Wallet) {
  await wrapper.vm.proceed();
  await flushPromises();
}

async function finishImport(wrapper: Wallet) {
  await wrapper.setData({ nickname: 'Imported' });
  await proceed(wrapper);
}

// The Substrate account is saved last; its sixth argument is the rule.
const substrateSave = () => mocks.save.mock.calls.find(([suri]) => suri === `${WORDS}${PATH}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validate.mockResolvedValue(true);
  mocks.discovery.mockResolvedValue([]);
  mocks.derive.mockReturnValue({});
  mocks.save.mockImplementation(async (suri: string) => (suri.includes('/m/44') ? '0xethereum' : 'substrate-address'));
});

describe('Substrate address choice on import', () => {
  it('asks which account to open when an earlier web version read the password differently, and saves the pick', async () => {
    mocks.accounts.mockResolvedValue(both);
    const wrapper = mountWallet('import');

    await enterWords(wrapper);

    expect(mocks.accounts).toHaveBeenCalledWith(`${WORDS}${PATH}`, 'sr25519');
    expect(choiceShown(wrapper)).toBe(true);
    expect(wrapper.vm.step).toBe(1);
    expect(wrapper.find('[data-testid="header"]').text()).toBe('Choose your address');
    expect(wrapper.find('[data-testid="substrateAddress-nfkd"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.find('[data-testid="substrateAddress-nfc"]').text()).toContain(EARLIER);

    await pick(wrapper, 'nfc');
    await proceed(wrapper);

    expect(choiceShown(wrapper)).toBe(false);
    expect(wrapper.vm.step).toBe(3);

    await finishImport(wrapper);

    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(substrateSave()?.[5]).toBe('nfc');
    wrapper.unmount();
  });

  it('keeps the current rule when the user goes on without choosing', async () => {
    mocks.accounts.mockResolvedValue(both);
    const wrapper = mountWallet('import');

    await enterWords(wrapper);
    await proceed(wrapper);
    await finishImport(wrapper);

    expect(substrateSave()?.[5]).toBe('nfkd');
    wrapper.unmount();
  });

  it('imports without asking when every rule opens the same account', async () => {
    mocks.accounts.mockResolvedValue([{ rule: 'nfkd', address: CURRENT }]);
    const wrapper = mountWallet('import');

    await enterWords(wrapper);

    expect(choiceShown(wrapper)).toBe(false);
    expect(wrapper.vm.step).toBe(3);

    await finishImport(wrapper);

    // Saved exactly as before this change: no rule argument.
    expect(substrateSave()).toHaveLength(5);
    wrapper.unmount();
  });

  it('does not look for other accounts when the path has no password', async () => {
    const wrapper = mountWallet('import');

    await enterWords(wrapper, '//polkadot');

    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(choiceShown(wrapper)).toBe(false);
    expect(wrapper.vm.step).toBe(3);
    wrapper.unmount();
  });

  it('goes back to the words from the choice, and back to the choice, pick kept, from the nickname', async () => {
    mocks.accounts.mockResolvedValue(both);
    const wrapper = mountWallet('import');

    await enterWords(wrapper);
    await pick(wrapper, 'nfc');
    wrapper.vm.back();
    await flushPromises();

    expect(choiceShown(wrapper)).toBe(false);
    expect(wrapper.vm.step).toBe(1);

    await proceed(wrapper);
    expect(choiceShown(wrapper)).toBe(true);
    expect(wrapper.find('[data-testid="substrateAddress-nfc"]').attributes('aria-checked')).toBe('true');
    await proceed(wrapper);
    expect(wrapper.vm.step).toBe(3);

    wrapper.vm.back();
    await flushPromises();

    expect(wrapper.vm.step).toBe(1);
    expect(choiceShown(wrapper)).toBe(true);
    expect(wrapper.find('[data-testid="substrateAddress-nfc"]').attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });

  it('forgets the pick when the path changes', async () => {
    mocks.accounts.mockResolvedValue(both);
    const wrapper = mountWallet('import');

    await enterWords(wrapper);
    await pick(wrapper, 'nfc');
    wrapper.vm.back();
    await enterWords(wrapper, '//kusama///pässwörd ＦＷ');

    expect(mocks.accounts).toHaveBeenLastCalledWith(`${WORDS}//kusama///pässwörd ＦＷ`, 'sr25519');
    expect(wrapper.find('[data-testid="substrateAddress-nfkd"]').attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });
});

describe('Substrate address choice on create', () => {
  it('never asks: new words always get the current rule', async () => {
    mocks.generate.mockResolvedValue(WORDS);
    const wrapper = mountWallet('create');

    await wrapper.setData({ nickname: 'Created', derivationPaths: paths(PATH) });
    await proceed(wrapper);
    await proceed(wrapper);
    // The backup check (MnemonicConfirmationForm) reports a confirmed backup.
    await wrapper.setData({ mnemonicConfirmed: true });
    await proceed(wrapper);
    await flushPromises();

    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(mocks.accounts).not.toHaveBeenCalled();
    expect(substrateSave()).toHaveLength(5);
    expect(substrateSave()?.[4]).toBe(true);
    wrapper.unmount();
  });
});
