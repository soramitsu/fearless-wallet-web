import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ candidates: vi.fn(), validate: vi.fn(), save: vi.fn(), derive: vi.fn(), push: vi.fn() }));
vi.mock('@/extension/messaging', () => ({
  tonImportCandidates: mocks.candidates,
  mnemonicValidate: mocks.validate,
  addAccount: mocks.save,
  generateMnemonic: vi.fn(),
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
vi.mock('@/util/BaseApi', () => ({ default: { parseJson: () => ({}), isValidSequenceMnemonic: () => true, isValidEthereumDerivationPath: () => true } }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: false, IS_SIDE_PANEL: false }));

import androidVectors from '../fixtures/ton/ton-android-4.2.0-vectors.json';
import bip39Vectors from '../fixtures/ton/ton-bip39-3.0.5-vectors.json';
import nativeVectors from '../fixtures/ton/ton-native-3.0.5-vectors.json';
import type { TonImportCandidateInfo } from '@extension-base/background/types/types';
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import TonAddressChoice from '@/screens/addWallet/TonAddressChoice.vue';
import { isTonImportUnchecked, preselectTonImportCandidate } from '@/screens/addWallet/tonImportChoice';
import { deriveTonImportCandidates, deriveTonImportChoice } from '@/util/tonKeyring';

const PHRASE = 'public test phrase';
const UNIVERSAL = 'UQ-universal-address';
const LEGACY = 'UQ-fearless-3-address';
const NATIVE = 'UQ-native-address';
const candidate = (
  derivation: TonImportCandidateInfo['derivation'],
  address: string,
  activity: TonImportCandidateInfo['activity'] = 'unknown',
  balance?: string
): TonImportCandidateInfo => ({ derivation, address, activity, ...(balance === undefined ? {} : { balance }) });
const offline = [candidate('universal', UNIVERSAL), candidate('fearless-legacy', LEGACY)];

// The import screen with the real address choice inside it.
const mountImport = (walletEcosystem = 'ton') =>
  shallowMount(AddWallet, {
    global: {
      mocks: {
        $t: (key: string, values?: Record<string, string>) => (values ? `${key} ${JSON.stringify(values)}` : key),
        $route: { params: { type: 'import', walletEcosystem } },
        $router: { push: mocks.push },
      },
      stubs: { CircleButton: true, FButton: true, NotificationPopup: true, TonAddressChoice: false },
    },
  });
const option = (wrapper: ReturnType<typeof mountImport>, derivation: string) => wrapper.find(`[data-testid="tonAddress-${derivation}"]`);
const choiceShown = (wrapper: ReturnType<typeof mountImport>) => wrapper.findComponent(TonAddressChoice).exists();

async function enterPhrase(wrapper: ReturnType<typeof mountImport>, mnemonic = PHRASE) {
  await wrapper.setData({ mnemonic });
  await wrapper.vm.proceed();
  await flushPromises();
}

async function finish(wrapper: ReturnType<typeof mountImport>, nickname = 'Restored TON') {
  await wrapper.setData({ nickname });
  await wrapper.vm.proceed();
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.derive.mockReturnValue({ tonAddress: UNIVERSAL, bitcoinAddress: 'bc1-fixture' });
  mocks.save.mockImplementation(async (_suri, _type, _meta, _ecosystem, choice) => choice?.address ?? 'substrate-address');
});

describe('TON import: phrase validation', () => {
  it('accepts a native TON phrase that is not BIP39 and imports its single address without asking', async () => {
    mocks.candidates.mockResolvedValue([candidate('native', NATIVE)]);
    const wrapper = mountImport();

    // Pasted with a line break, repeated spaces and a capital: the background gets the text as typed,
    // because spacing and capitals can be part of a TON key.
    const typed = '  Public  test\nphrase ';
    await enterPhrase(wrapper, typed);

    expect(mocks.candidates).toHaveBeenCalledWith(typed);
    // The BIP39-only check that refused native TON phrases is not asked about a TON import.
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(wrapper.vm.warningValueName).toBe('');
    expect(choiceShown(wrapper)).toBe(false);
    expect(wrapper.vm.step).toBe(3);

    await finish(wrapper);

    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(mocks.save).toHaveBeenCalledOnce();
    // The background stores the phrase that opens the chosen address.
    expect(mocks.save).toHaveBeenCalledWith(
      typed,
      expect.anything(),
      { name: 'Restored TON', ethereumAddress: '', walletEcosystem: 'ton' },
      'ton',
      { derivation: 'native', address: NATIVE }
    );
    // A native TON phrase has no Universal Wallet accounts to derive.
    expect(mocks.derive).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('reports a phrase that opens no TON address as invalid and stays on the phrase', async () => {
    mocks.candidates.mockResolvedValue([]);
    const wrapper = mountImport();

    await enterPhrase(wrapper, 'not a recovery phrase');

    expect(wrapper.vm.warningValueName).toBe('mnemonic');
    expect(wrapper.vm.step).toBe(1);
    expect(choiceShown(wrapper)).toBe(false);
    expect(wrapper.findComponent({ name: 'ImportWallet' }).exists()).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the BIP39 check for other networks and never derives TON addresses for them', async () => {
    mocks.validate.mockResolvedValue(true);
    const wrapper = mountImport('substrate');

    await enterPhrase(wrapper);

    expect(mocks.validate).toHaveBeenCalledWith('substrate', PHRASE);
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(wrapper.vm.step).toBe(3);

    await finish(wrapper);

    expect(mocks.save.mock.calls.at(-1)).toEqual([PHRASE, expect.anything(), expect.anything(), 'substrate', false]);
    // Without a ///password the Universal Wallet accounts use no passphrase.
    expect(mocks.derive).toHaveBeenCalledWith(PHRASE, '', []);
    wrapper.unmount();
  });
});

describe('TON import: address choice', () => {
  it('shows both addresses of a BIP39 phrase and preselects the one in use', async () => {
    mocks.candidates.mockResolvedValue([candidate('universal', UNIVERSAL, 'empty', '0'), candidate('fearless-legacy', LEGACY, 'active', '12.34')]);
    const wrapper = mountImport();

    await enterPhrase(wrapper);

    expect(wrapper.vm.step).toBe(1);
    expect(choiceShown(wrapper)).toBe(true);
    expect(wrapper.findComponent({ name: 'ImportWallet' }).exists()).toBe(false);
    expect(wrapper.find('[data-testid="header"]').text()).toBe('ux.tonAddressChoiceTitle');
    expect(option(wrapper, 'universal').text()).toContain(UNIVERSAL);
    expect(option(wrapper, 'universal').text()).toContain('ux.tonAddressEmpty');
    expect(option(wrapper, 'fearless-legacy').text()).toContain(LEGACY);
    expect(option(wrapper, 'fearless-legacy').text()).toContain('ux.tonAddressLegacy');
    expect(option(wrapper, 'fearless-legacy').text()).toContain('ux.tonAddressBalance {"amount":"12.34"}');
    expect(option(wrapper, 'fearless-legacy').attributes('aria-checked')).toBe('true');
    expect(option(wrapper, 'universal').attributes('aria-checked')).toBe('false');
    expect(wrapper.find('[data-testid="tonAddressUnchecked"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tonAddressBothHint"]').exists()).toBe(true);
    expect(wrapper.vm.disabledProceed).toBe(false);

    await wrapper.vm.proceed();
    expect(wrapper.vm.step).toBe(3);
    expect(choiceShown(wrapper)).toBe(false);
    await finish(wrapper);

    expect(mocks.save).toHaveBeenCalledWith(PHRASE, expect.anything(), expect.objectContaining({ name: 'Restored TON' }), 'ton', {
      derivation: 'fearless-legacy',
      address: LEGACY,
    });
    // The 3.0.x key is not part of the phrase's Universal Wallet.
    expect(mocks.derive).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('falls back to the universal address with both shown when the addresses cannot be checked', async () => {
    mocks.candidates.mockResolvedValue(offline);
    const wrapper = mountImport();

    await enterPhrase(wrapper);

    expect(choiceShown(wrapper)).toBe(true);
    expect(option(wrapper, 'universal').attributes('aria-checked')).toBe('true');
    expect(option(wrapper, 'fearless-legacy').attributes('aria-checked')).toBe('false');
    expect(option(wrapper, 'universal').text()).toContain('ux.tonAddressUnknown');
    expect(option(wrapper, 'fearless-legacy').text()).toContain('ux.tonAddressUnknown');
    // Says the selection is only a default and how to recognise a Fearless 3.0 wallet.
    expect(wrapper.find('[data-testid="tonAddressUnchecked"]').attributes('role')).toBe('status');

    await wrapper.vm.proceed();
    await finish(wrapper);

    expect(mocks.save.mock.calls.at(-1)![4]).toEqual({ derivation: 'universal', address: UNIVERSAL });
    // The universal key belongs to the phrase's Universal Wallet, as for a newly created wallet.
    expect(mocks.derive).toHaveBeenCalledWith(PHRASE);
    expect(mocks.save.mock.calls.at(-1)![2]).toMatchObject({ walletEcosystem: 'ton', bitcoinAddress: 'bc1-fixture' });
    wrapper.unmount();
  });

  it('saves the address the user picks over the preselected one', async () => {
    mocks.candidates.mockResolvedValue(offline);
    const wrapper = mountImport();

    await enterPhrase(wrapper);
    await option(wrapper, 'fearless-legacy').trigger('click');

    expect(option(wrapper, 'fearless-legacy').attributes('aria-checked')).toBe('true');
    expect(option(wrapper, 'universal').attributes('aria-checked')).toBe('false');

    await wrapper.vm.proceed();
    await finish(wrapper);

    expect(mocks.save.mock.calls.at(-1)![4]).toEqual({ derivation: 'fearless-legacy', address: LEGACY });
    wrapper.unmount();
  });

  it('labels the address of a phrase kept exactly as typed, and an address already in the wallet', async () => {
    mocks.candidates.mockResolvedValue([
      candidate('native', NATIVE, 'empty', '0'),
      { ...candidate('as-typed', 'UQ-as-typed-address', 'active', '7'), inWallet: true },
    ]);
    const wrapper = mountImport();

    await enterPhrase(wrapper, `${PHRASE} `);

    expect(option(wrapper, 'as-typed').text()).toContain('ux.tonAddressAsTyped');
    expect(option(wrapper, 'as-typed').text()).toContain('ux.tonAddressAsTypedDescription');
    expect(option(wrapper, 'as-typed').find('[data-testid="tonAddressInWallet"]').text()).toBe('ux.tonAddressInWallet');
    expect(option(wrapper, 'native').find('[data-testid="tonAddressInWallet"]').exists()).toBe(false);
    expect(option(wrapper, 'as-typed').attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });

  it('offers the native address of a phrase that passes both checks', async () => {
    mocks.candidates.mockResolvedValue([candidate('universal', UNIVERSAL, 'empty', '0'), candidate('native', NATIVE, 'active', '3')]);
    const wrapper = mountImport();

    await enterPhrase(wrapper);

    expect(option(wrapper, 'native').text()).toContain('ux.tonAddressNative');
    expect(option(wrapper, 'native').attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });

  it('goes back from the choice to the phrase, and from the nickname to the choice, keeping the pick', async () => {
    mocks.candidates.mockResolvedValue(offline);
    const wrapper = mountImport();

    await enterPhrase(wrapper);
    await option(wrapper, 'fearless-legacy').trigger('click');
    wrapper.vm.back();
    await flushPromises();

    expect(wrapper.vm.step).toBe(1);
    expect(choiceShown(wrapper)).toBe(false);
    expect(wrapper.findComponent({ name: 'ImportWallet' }).exists()).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();

    // The same phrase again: the pick is kept.
    await wrapper.vm.proceed();
    await flushPromises();
    expect(option(wrapper, 'fearless-legacy').attributes('aria-checked')).toBe('true');

    await wrapper.vm.proceed();
    expect(wrapper.vm.step).toBe(3);
    wrapper.vm.back();
    await flushPromises();
    expect(wrapper.vm.step).toBe(1);
    expect(choiceShown(wrapper)).toBe(true);
    expect(option(wrapper, 'fearless-legacy').attributes('aria-checked')).toBe('true');

    // Another phrase: its own addresses, preselected afresh.
    wrapper.vm.back();
    mocks.candidates.mockResolvedValue([candidate('universal', 'UQ-other-universal'), candidate('fearless-legacy', 'UQ-other-legacy')]);
    await enterPhrase(wrapper, 'another public phrase');
    expect(option(wrapper, 'universal').attributes('aria-checked')).toBe('true');
    expect(option(wrapper, 'universal').text()).toContain('UQ-other-universal');
    wrapper.unmount();
  });

  it('keeps the phrase and the pick when the address lookup or the save fails', async () => {
    mocks.candidates.mockRejectedValueOnce(new Error('worker unavailable'));
    const wrapper = mountImport();

    await enterPhrase(wrapper);
    expect(wrapper.vm.flowError).toBe(true);
    expect(wrapper.vm.step).toBe(1);
    expect(wrapper.vm.mnemonic).toBe(PHRASE);

    mocks.candidates.mockResolvedValue(offline);
    await wrapper.vm.proceed();
    await flushPromises();
    await option(wrapper, 'fearless-legacy').trigger('click');
    await wrapper.vm.proceed();
    mocks.save.mockRejectedValueOnce(new Error('account_key_mismatch'));
    await finish(wrapper);

    expect(wrapper.vm.flowError).toBe(true);
    expect(wrapper.vm.savedSuccessfully).toBe(false);
    await wrapper.vm.proceed();
    await flushPromises();
    expect(wrapper.vm.savedSuccessfully).toBe(true);
    expect(mocks.save.mock.calls.at(-1)![4]).toEqual({ derivation: 'fearless-legacy', address: LEGACY });
    wrapper.unmount();
  });
});

describe('TON import: preselection', () => {
  const [universal, legacy] = offline;
  const active = (source: TonImportCandidateInfo): TonImportCandidateInfo => ({ ...source, activity: 'active', balance: '1' });
  const empty = (source: TonImportCandidateInfo): TonImportCandidateInfo => ({ ...source, activity: 'empty', balance: '0' });

  it('prefers the only address in use, otherwise the address new wallets get', () => {
    expect(preselectTonImportCandidate([universal, active(legacy)])?.derivation).toBe('fearless-legacy');
    expect(preselectTonImportCandidate([empty(universal), active(legacy)])?.derivation).toBe('fearless-legacy');
    expect(preselectTonImportCandidate([active(universal), empty(legacy)])?.derivation).toBe('universal');
    expect(preselectTonImportCandidate([active(universal), active(legacy)])?.derivation).toBe('universal');
    expect(preselectTonImportCandidate([empty(universal), empty(legacy)])?.derivation).toBe('universal');
    expect(preselectTonImportCandidate([universal, legacy])?.derivation).toBe('universal');
    expect(preselectTonImportCandidate([empty(universal), legacy])?.derivation).toBe('universal');
    expect(preselectTonImportCandidate([candidate('native', NATIVE)])?.derivation).toBe('native');
    expect(preselectTonImportCandidate([])).toBeUndefined();
  });

  it('says so only when the default was chosen without knowing', () => {
    expect(isTonImportUnchecked([universal, legacy])).toBe(true);
    expect(isTonImportUnchecked([empty(universal), legacy])).toBe(true);
    expect(isTonImportUnchecked([universal, active(legacy)])).toBe(false);
    expect(isTonImportUnchecked([empty(universal), empty(legacy)])).toBe(false);
    expect(isTonImportUnchecked([active(universal), active(legacy)])).toBe(false);
  });

  it('renders each address as a labelled radio option', async () => {
    const wrapper = mount(TonAddressChoice, {
      props: { candidates: [empty(universal), active(legacy)], modelValue: 'universal' },
      global: { mocks: { $t: (key: string) => key } },
    });

    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('ux.tonAddressChoiceTitle');
    expect(wrapper.findAll('[role="radio"]').map((radio) => radio.attributes('aria-checked'))).toEqual(['true', 'false']);
    expect(option(wrapper as never, 'universal').text()).toContain('ux.tonAddressUniversalDescription');
    expect(option(wrapper as never, 'fearless-legacy').text()).toContain('ux.tonAddressLegacyDescription');

    await option(wrapper as never, 'fearless-legacy').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['fearless-legacy']]);
    wrapper.unmount();
  });
});

// The screen and the background derivation together, on phrases written by the 3.0.5 libraries.
describe('TON import: a 3.0.x phrase ends at the address 3.0.x stored', { timeout: 120_000 }, () => {
  beforeEach(() => {
    mocks.candidates.mockImplementation(async (mnemonic: string) =>
      (await deriveTonImportCandidates(mnemonic)).map(({ derivation, address }) => candidate(derivation, address))
    );
    mocks.save.mockImplementation(async (suri: string, _type, _meta, _ecosystem, choice) => (await deriveTonImportChoice(suri, choice)).address);
  });

  it('for a TON wallet imported from a BIP39 phrase, once the Fearless 3.0 address is picked', async () => {
    const [vector] = bip39Vectors.vectors;
    const wrapper = mountImport();

    await enterPhrase(wrapper, vector.mnemonic);
    expect(option(wrapper, 'fearless-legacy').text()).toContain(vector.address);
    await option(wrapper, 'fearless-legacy').trigger('click');
    await wrapper.vm.proceed();
    await finish(wrapper);

    // The save derives the key with tonweb's KDF, which outlasts a promise flush.
    await vi.waitFor(() => expect(wrapper.vm.savedSuccessfully).toBe(true));
    await expect(mocks.save.mock.results.at(-1)!.value).resolves.toBe(vector.address);
    wrapper.unmount();
  });

  it('for a TON wallet created from a native TON phrase, pasted with stray spaces and capitals', async () => {
    const vector = nativeVectors.vectors.find(({ bip39Valid }) => !bip39Valid)!;
    const wrapper = mountImport();

    await enterPhrase(wrapper, `\n ${vector.mnemonic.replace(' ', '   ').replace(/^./, (letter) => letter.toUpperCase())} `);
    expect(wrapper.vm.warningValueName).toBe('');
    // The text as typed opens an address of its own; the 3.0.x one comes first and is preselected offline.
    expect(option(wrapper, 'native').text()).toContain(vector.address);
    expect(option(wrapper, 'native').attributes('aria-checked')).toBe('true');
    expect(option(wrapper, 'as-typed').exists()).toBe(true);
    await wrapper.vm.proceed();
    await finish(wrapper);

    await vi.waitFor(() => expect(wrapper.vm.savedSuccessfully).toBe(true));
    await expect(mocks.save.mock.results.at(-1)!.value).resolves.toBe(vector.address);
    wrapper.unmount();
  });

  it('for a TON wallet the Android app kept with its own spacing, once that address is picked', async () => {
    const vector = androidVectors.vectors.find(({ variant }) => variant === 'trailing-space')!;
    const wrapper = mountImport();

    await enterPhrase(wrapper, vector.typedText);
    await option(wrapper, 'as-typed').trigger('click');
    await wrapper.vm.proceed();
    await finish(wrapper);

    await vi.waitFor(() => expect(wrapper.vm.savedSuccessfully).toBe(true));
    expect(mocks.save.mock.calls.at(-1)![0]).toBe(vector.typedText);
    const saved = await deriveTonImportChoice(vector.typedText, mocks.save.mock.calls.at(-1)![4]);
    expect(Buffer.from(saved.publicKey).toString('hex')).toBe(vector.publicKeyHex);
    expect(saved.phrase).toBe(vector.typedText);
    wrapper.unmount();
  });
});
