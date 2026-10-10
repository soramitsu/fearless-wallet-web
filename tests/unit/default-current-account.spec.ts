import { describe, expect, it, vi } from 'vitest';

// State and Extension are exercised through their prototypes; their services are never built.
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

import State from '@extension-base/background/handlers/State';
import Extension from '@extension-base/background/handlers/Extension';
import { pickDefaultCurrentAccount, toCurrentAccountInfo, type MainAccount } from '@extension-base/background/helpers/currentAccount';
import type { CurrentAccountState } from '@extension-base/stores/CurrentAccountStore';
import { WalletEcosystem } from '@/interfaces';

const EVM_ADDRESS = '0x2222222222222222222222222222222222222222';
const SUBSTRATE: MainAccount = {
  address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  meta: { name: 'Polkadot', walletEcosystem: WalletEcosystem.Substrate, ethereumAddress: '0x1111111111111111111111111111111111111111', isMobile: false },
};
const LEGACY_SUBSTRATE: MainAccount = { address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', meta: { name: 'Legacy', isMobile: false } };
const TON: MainAccount = { address: 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44', meta: { name: 'TON', walletEcosystem: WalletEcosystem.Ton, isMobile: false } };
const BITCOIN: MainAccount = { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', meta: { name: 'Bitcoin', walletEcosystem: WalletEcosystem.Bitcoin } };
// Shaped as getAllMainAccounts() returns an independently imported EVM account.
const EVM: MainAccount = { address: EVM_ADDRESS, meta: { name: 'Imported EVM', walletEcosystem: WalletEcosystem.Evm, ethereumAddress: EVM_ADDRESS } };

describe('default current account', () => {
  it.each([
    ['a standalone EVM account listed first', [EVM, SUBSTRATE], SUBSTRATE],
    ['EVM and TON', [EVM, TON], TON],
    ['a legacy account without an ecosystem after TON', [TON, LEGACY_SUBSTRATE], LEGACY_SUBSTRATE],
    ['EVM, Bitcoin and TON', [EVM, BITCOIN, TON], TON],
    ['EVM and Bitcoin', [EVM, BITCOIN], BITCOIN],
    ['only EVM', [EVM], EVM],
  ])('prefers a non-EVM account: %s', (_, accounts, expected) => {
    expect(pickDefaultCurrentAccount(accounts)).toBe(expected);
  });

  it('keeps the stored order within a kind and returns nothing for no accounts', () => {
    expect(pickDefaultCurrentAccount([SUBSTRATE, LEGACY_SUBSTRATE])).toBe(SUBSTRATE);
    expect(pickDefaultCurrentAccount([])).toBeUndefined();
  });
});

describe('selecting a current account after install or update', () => {
  function install(currentAccount: CurrentAccountState, accounts: MainAccount[]) {
    const state = { currentAccount, keyringService: { getAllMainAccounts: () => accounts }, setCurrentAccount: vi.fn() };
    return State.prototype.onInstall.call(state as unknown as State).then(() => state.setCurrentAccount);
  }

  it('keeps the stored account on update even when a standalone EVM account is listed first', async () => {
    const stored = toCurrentAccountInfo(SUBSTRATE);
    expect(await install(stored, [EVM, SUBSTRATE])).toHaveBeenCalledExactlyOnceWith(stored);
  });

  it('chooses a non-EVM account when none is stored', async () => {
    expect(await install(null, [EVM, TON, SUBSTRATE])).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: SUBSTRATE.address,
      walletEcosystem: WalletEcosystem.Substrate,
    }));
  });

  it('chooses a standalone EVM account only when it is the only account', async () => {
    expect(await install(null, [EVM])).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: EVM_ADDRESS,
      ethereumAddress: EVM_ADDRESS,
      walletEcosystem: WalletEcosystem.Evm,
    }));
    expect(await install(null, [])).toHaveBeenCalledExactlyOnceWith(null);
  });
});

describe('removing the current account', () => {
  function forget(removed: MainAccount, remaining: MainAccount[], current = removed) {
    const state = {
      currentAccount: toCurrentAccountInfo(current),
      keyringService: {
        getPair: () => ({ meta: removed.meta }),
        forgetAccount: vi.fn(),
        getAllMainAccounts: () => remaining,
      },
      requestService: { getAuthorize: (callback: (urls: object) => void) => callback({}), updateAuthorizedAccounts: vi.fn() },
      walletConnectService: { removeSessions: vi.fn() },
      setCurrentAccount: vi.fn(),
      updateCurrentAccount: vi.fn(() => true),
      cleanupDeletedAccount: vi.fn(),
    };
    const extension = { state } as unknown as Extension;
    return Extension.prototype.accountsForget.call(extension, { address: removed.address, type: 'native' }).then(() => state);
  }

  it('switches to the next non-EVM account, not a standalone EVM account listed first', async () => {
    const state = await forget(SUBSTRATE, [EVM, TON]);
    expect(state.updateCurrentAccount).toHaveBeenCalledExactlyOnceWith({ address: TON.address, walletEcosystem: WalletEcosystem.Ton });
    expect(state.setCurrentAccount).not.toHaveBeenCalled();
  });

  it('stores the remaining standalone EVM account instead of keeping the removed one selected', async () => {
    const state = await forget(SUBSTRATE, [EVM]);
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(state.setCurrentAccount).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: EVM_ADDRESS,
      walletEcosystem: WalletEcosystem.Evm,
    }));
  });

  it('clears the selection when no account remains', async () => {
    const state = await forget(SUBSTRATE, []);
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(state.setCurrentAccount).toHaveBeenCalledExactlyOnceWith(null);
    expect(state.cleanupDeletedAccount).toHaveBeenCalledWith(SUBSTRATE.address);
  });

  it('leaves the selection alone when another account is removed', async () => {
    const state = await forget(TON, [SUBSTRATE, EVM], SUBSTRATE);
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(state.setCurrentAccount).not.toHaveBeenCalled();
  });
});
