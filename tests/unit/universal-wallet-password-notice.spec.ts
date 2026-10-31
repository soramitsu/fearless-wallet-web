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
  clipboard: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/consts/global', () => mocks.environment);
vi.mock('@/extension/messaging', () => ({
  universalWalletPasswordStatus: mocks.status,
  addUniversalWalletPasswordPath: mocks.addPath,
  switchUniversalWalletAccounts: mocks.switchAccounts,
  checkUniversalWalletWatched: mocks.checkWatched,
}));
vi.mock('@/helpers', () => ({ setClipboard: mocks.clipboard }));

import UniversalWalletPasswordNotice from '@/screens/main/UniversalWalletPasswordNotice.vue';
import { universalWalletPasswordNoticeRequest } from '@/util/universalWalletPasswordNotice';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const STORAGE_KEY = 'fearless:universal-wallet-password-notice:v1';
const legacyStatus: UniversalWalletPasswordStatus = { state: 'legacy', rows: [
  { network: 'bitcoin', legacyAddress: 'bc1qold', protectedAddress: 'bc1qnew' },
  { network: 'solana', legacyAddress: 'SolOld', protectedAddress: 'SolNew' },
] };
const wallet = (address: string, current = true): AccountJson => ({
  address, name: address, ethereumAddress: '',
  ...(current ? { walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } : {}),
}) as AccountJson;
const wrappers: ReturnType<typeof mount>[] = [];
const mountNotice = async () => {
  const wrapper = mount(UniversalWalletPasswordNotice, {
    attachTo: document.body,
    global: { plugins: [createI18n({ legacy: false, locale: 'en-EN' })], stubs: { Icon: true } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
};
const dialogOpen = () => document.querySelector('[data-testid="universalWalletPasswordNotice"]')?.hasAttribute('open') ?? false;
const click = async (testId: string) => {
  (document.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
  await flushPromises();
};

beforeEach(() => {
  localStorage.clear();
  mocks.environment.IS_EXTENSION = true;
  mocks.accounts = reactive({ accounts: [wallet('created'), wallet('imported', false)], selectedWallet: { address: 'created' } });
  mocks.status.mockReset().mockResolvedValue(legacyStatus);
  mocks.addPath.mockReset();
  mocks.switchAccounts.mockReset();
  mocks.checkWatched.mockReset().mockResolvedValue({ changed: false, status: { state: 'protected' } });
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

describe('Universal Wallet password notice', () => {
  it('lists each old address with its protected address and opens once per wallet', async () => {
    await mountNotice();

    expect(mocks.status).toHaveBeenCalledWith('created');
    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain('Move funds from old addresses');
    expect(document.querySelector('[data-testid="universalWalletPassword-bitcoin"]')?.textContent).toContain('bc1qold');
    expect(document.querySelector('[data-testid="universalWalletPassword-bitcoin"]')?.textContent).toContain('bc1qnew');

    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Later')!.click();
    await flushPromises();
    expect(dialogOpen()).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(['created']);

    wrappers.pop()!.unmount();
    await mountNotice();
    expect(dialogOpen()).toBe(false);

    // Wallet details can ask for it again.
    universalWalletPasswordNoticeRequest.value = 'created';
    await flushPromises();
    expect(dialogOpen()).toBe(true);
    expect(universalWalletPasswordNoticeRequest.value).toBeNull();
  });

  it('reports what the switch did for each address', async () => {
    mocks.switchAccounts.mockResolvedValue([
      { network: 'bitcoin', outcome: 'switched' },
      { network: 'solana', outcome: 'funded' },
    ]);
    mocks.status.mockResolvedValueOnce(legacyStatus).mockResolvedValueOnce({ state: 'legacy', rows: [legacyStatus.rows[1]] });
    await mountNotice();

    await click('universalWalletPasswordSwitch');

    expect(mocks.switchAccounts).toHaveBeenCalledWith('created');
    expect(document.querySelector('[data-testid="universalWalletPassword-bitcoin"]')).toBeNull();
    expect(document.querySelector('[data-testid="universalWalletPassword-solana"]')?.textContent).toContain('Still holds funds');
    expect(dialogOpen()).toBe(true);
  });

  it('asks an older wallet for its derivation path and keeps only a path that opens it', async () => {
    mocks.status.mockResolvedValue({ state: 'password-unknown' });
    mocks.addPath.mockResolvedValueOnce({ ok: false, code: 'path_mismatch' })
      .mockResolvedValueOnce({ ok: true, status: legacyStatus });
    await mountNotice();
    const input = document.querySelector('[data-testid="universalWalletPasswordPath"]') as HTMLInputElement;
    const submit = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await nextTick();
      [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Continue')!.click();
      await flushPromises();
    };

    expect(document.body.textContent).toContain('Does this wallet have a password?');
    await submit('//wrong///x');
    expect(document.body.textContent).toContain("This path doesn't open this wallet.");
    await submit('//polkadot///TREZOR');
    expect(mocks.addPath).toHaveBeenLastCalledWith('created', '//polkadot///TREZOR');
    expect(document.querySelector('[data-testid="universalWalletPassword-solana"]')).not.toBeNull();
  });

  it('reopens a closed notice when funds reach an old address, without offering a switch for them', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['created']));
    mocks.status.mockResolvedValue({ state: 'protected' });
    mocks.checkWatched.mockResolvedValueOnce({
      changed: true,
      status: { state: 'legacy', rows: [], arrived: [{ network: 'solana', legacyAddress: 'SolOld' }] },
    });

    await mountNotice();

    expect(mocks.checkWatched).toHaveBeenCalledWith('created');
    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain('Funds arrived at your old address');
    expect(document.querySelector('[data-testid="universalWalletArrived-solana"]')?.textContent).toContain('SolOld');
    expect(document.querySelector('[data-testid="universalWalletPasswordSwitch"]')).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
  });

  it('stays away from an old wallet, which carries its recovery warning instead', async () => {
    mocks.accounts.selectedWallet.address = 'imported';
    await mountNotice();

    expect(mocks.status).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it('shows nothing for a protected wallet or one without a password', async () => {
    mocks.status.mockResolvedValue({ state: 'protected' });
    await mountNotice();
    expect(dialogOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
