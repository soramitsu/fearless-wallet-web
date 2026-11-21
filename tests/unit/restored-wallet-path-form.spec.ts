import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson, UniversalWalletPasswordStatus } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({
  accounts: null as unknown as { accounts: AccountJson[]; selectedWallet: { address: string } },
  environment: { IS_EXTENSION: true, IS_PRODUCTION: true },
  status: vi.fn(),
  addPath: vi.fn(),
  switchAccounts: vi.fn(),
  checkWatched: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/consts/global', () => mocks.environment);
vi.mock('@/extension/messaging', () => ({
  universalWalletPasswordStatus: mocks.status,
  addUniversalWalletPasswordPath: mocks.addPath,
  switchUniversalWalletAccounts: mocks.switchAccounts,
  checkUniversalWalletWatched: mocks.checkWatched,
}));

import RestoredWalletPathForm from '@/components/RestoredWalletPathForm.vue';
import UniversalWalletPasswordNotice from '@/screens/main/UniversalWalletPasswordNotice.vue';
import { universalWalletPasswordNoticeRequest } from '@/util/universalWalletPasswordNotice';

const STORAGE_KEY = 'fearless:universal-wallet-password-notice:v1';
const legacyStatus: UniversalWalletPasswordStatus = { state: 'legacy', rows: [
  { network: 'bitcoin', legacyAddress: 'bc1qold', protectedAddress: 'bc1qnew' },
] };
const i18n = () => createI18n({ legacy: false, locale: 'en-EN' });
const wrappers: ReturnType<typeof mount>[] = [];

const typePath = async (value: string) => {
  const input = document.querySelector('[data-testid="restoredWalletPath"]') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await nextTick();
};
const click = async (testId: string) => {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
  await flushPromises();
};
const dialogOpen = () => document.querySelector('[data-testid="universalWalletPasswordNotice"]')?.hasAttribute('open') ?? false;

beforeEach(() => {
  localStorage.clear();
  // A JSON restore is an imported key: recovery-only in the extension.
  mocks.accounts = reactive({ accounts: [{ address: 'restored', name: 'Restored', ethereumAddress: '' } as AccountJson],
    selectedWallet: { address: 'restored' } });
  mocks.status.mockReset().mockResolvedValue({ state: 'path-required' });
  mocks.addPath.mockReset();
  mocks.switchAccounts.mockReset();
  // Nothing new at any watched old address.
  mocks.checkWatched.mockReset().mockResolvedValue({ changed: false, status: { state: 'none' } });
  universalWalletPasswordNoticeRequest.value = null;
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the derivation path form of a restored wallet', () => {
  const mountForm = () => {
    const wrapper = mount(RestoredWalletPathForm, { props: { address: 'restored' }, attachTo: document.body, global: { plugins: [i18n()] } });
    wrappers.push(wrapper);
    return wrapper;
  };

  it('says what the path brings back and keeps asking until a path opens the wallet', async () => {
    mocks.addPath.mockResolvedValueOnce({ ok: false, code: 'path_mismatch' })
      .mockResolvedValueOnce({ ok: true, status: { state: 'none' } });
    const wrapper = mountForm();

    expect(document.body.textContent).toContain('Enter the derivation path');
    expect(document.body.textContent).toContain('Bitcoin, Solana, TON and Taira');
    expect((document.querySelector('[data-testid="restoredWalletPathContinue"]') as HTMLButtonElement).disabled).toBe(true);

    await typePath('//wrong');
    await click('restoredWalletPathContinue');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("This path doesn't open this wallet.");
    expect(wrapper.emitted('done')).toBeUndefined();

    await typePath('//polkadot///TREZOR');
    await click('restoredWalletPathContinue');
    expect(mocks.addPath).toHaveBeenLastCalledWith('restored', '//polkadot///TREZOR');
    expect(wrapper.emitted('done')).toEqual([[{ state: 'none' }]]);
    expect((document.querySelector('[data-testid="restoredWalletPath"]') as HTMLInputElement).value).toBe('');
  });

  it('can be skipped, and reports a failure without closing', async () => {
    mocks.addPath.mockRejectedValueOnce(new Error('worker restarted'));
    const wrapper = mountForm();

    await typePath('//staking');
    await click('restoredWalletPathContinue');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Something went wrong. Try again.');

    await click('restoredWalletPathSkip');
    expect(wrapper.emitted('skip')).toHaveLength(1);
    expect(wrapper.emitted('done')).toBeUndefined();
  });

  it('checks once at a time and ignores an answer meant for an earlier wallet', async () => {
    let answer!: (value: unknown) => void;
    mocks.addPath.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const wrapper = mountForm();

    await typePath('//staking');
    await click('restoredWalletPathContinue');
    await click('restoredWalletPathContinue');
    expect(mocks.addPath).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-testid="restoredWalletPathContinue"]')?.textContent?.trim()).toBe('Checking…');

    await wrapper.setProps({ address: 'another' });
    answer({ ok: true, status: { state: 'none' } });
    await flushPromises();
    expect(wrapper.emitted('done')).toBeUndefined();
  });
});

describe('the wallet notice for a restored wallet waiting for its path', () => {
  const mountNotice = async () => {
    const wrapper = mount(UniversalWalletPasswordNotice, {
      attachTo: document.body,
      global: { plugins: [i18n()], stubs: { Icon: true } },
    });
    wrappers.push(wrapper);
    await flushPromises();
    return wrapper;
  };

  it('never opens by itself on a recovery-only wallet, but opens from wallet details', async () => {
    await mountNotice();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);

    universalWalletPasswordNoticeRequest.value = 'restored';
    await flushPromises();
    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain('Enter the derivation path');
  });

  it('opens once on a wallet without the recovery warning, and goes on to the old addresses after the path', async () => {
    mocks.environment.IS_EXTENSION = false;
    mocks.addPath.mockResolvedValueOnce({ ok: true, status: legacyStatus });
    try {
      await mountNotice();
      expect(dialogOpen()).toBe(true);

      await typePath('//polkadot///TREZOR');
      await click('restoredWalletPathContinue');
      expect(document.body.textContent).toContain('Move funds from old addresses');
      expect(document.querySelector('[data-testid="universalWalletPassword-bitcoin"]')?.textContent).toContain('bc1qnew');
    } finally {
      mocks.environment.IS_EXTENSION = true;
    }
  });

  it('closes for good when the path is skipped or brings nothing further to show', async () => {
    mocks.environment.IS_EXTENSION = false;
    try {
      await mountNotice();
      await click('restoredWalletPathSkip');
      expect(dialogOpen()).toBe(false);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['restored']);

      mocks.addPath.mockResolvedValueOnce({ ok: true, status: { state: 'protected' } });
      universalWalletPasswordNoticeRequest.value = 'restored';
      await flushPromises();
      await typePath('//unicode///pw');
      await click('restoredWalletPathContinue');
      expect(dialogOpen()).toBe(false);
    } finally {
      mocks.environment.IS_EXTENSION = true;
    }
  });
});
