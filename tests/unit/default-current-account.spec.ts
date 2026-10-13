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
    const state = Object.setPrototypeOf({ currentAccount, keyringService: { getAllMainAccounts: () => accounts }, setCurrentAccount: vi.fn() }, State.prototype);
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

  // Earlier builds kept the deleted account selected when the last wallet, or the selected
  // one with only a standalone EVM account left, was removed.
  it('replaces a stored selection whose account was removed before the update', async () => {
    const removed = toCurrentAccountInfo(LEGACY_SUBSTRATE);
    expect(await install(removed, [EVM, TON])).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: TON.address,
      walletEcosystem: WalletEcosystem.Ton,
    }));
    expect(await install(removed, [EVM])).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ address: EVM_ADDRESS }));
    expect(await install(removed, [])).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('keeps a stored standalone EVM or TON selection that still exists', async () => {
    const evm = toCurrentAccountInfo(EVM);
    const ton = toCurrentAccountInfo(TON);
    expect(await install(evm, [SUBSTRATE, EVM])).toHaveBeenCalledExactlyOnceWith(evm);
    expect(await install(ton, [SUBSTRATE, TON])).toHaveBeenCalledExactlyOnceWith(ton);
  });
});

describe('repairing the selection at every start-up', () => {
  async function start(currentAccount: CurrentAccountState, accounts: MainAccount[]) {
    const state = Object.setPrototypeOf({ currentAccount, keyringService: { getAllMainAccounts: () => accounts }, setCurrentAccount: vi.fn() }, State.prototype);
    await State.prototype.ensureCurrentAccount.call(state as unknown as State);
    return state.setCurrentAccount;
  }

  it('writes nothing while the stored selection exists or there is nothing to select', async () => {
    expect(await start(toCurrentAccountInfo(SUBSTRATE), [EVM, SUBSTRATE])).not.toHaveBeenCalled();
    expect(await start(toCurrentAccountInfo(EVM), [EVM])).not.toHaveBeenCalled();
    expect(await start(null, [])).not.toHaveBeenCalled();
  });

  it('selects the default account when none is stored, never a standalone EVM account before others', async () => {
    expect(await start(null, [EVM, TON, SUBSTRATE])).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      address: SUBSTRATE.address,
      walletEcosystem: WalletEcosystem.Substrate,
    }));
  });

  it('replaces a selection whose account was removed, and clears it when no account remains', async () => {
    const removed = toCurrentAccountInfo(LEGACY_SUBSTRATE);
    expect(await start(removed, [EVM, TON])).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ address: TON.address }));
    expect(await start(removed, [])).toHaveBeenCalledExactlyOnceWith(null);
  });
});

describe('removing the current account', () => {
  it('does not forget accounts after site permission storage rejects', async () => {
    const state = {
      keyringService: {
        archiveWallet: vi.fn(async () => undefined),
        getPair: () => ({meta:SUBSTRATE.meta}),
        forgetAccount: vi.fn(), forgetAddress:vi.fn(),
      },
      requestService: { mutateAuthorizations:vi.fn(async () => { throw new Error('Public permission write failure'); }) },
      walletConnectService: { removeSessions:vi.fn() },
      setCurrentAccount:vi.fn(), cleanupDeletedAccount:vi.fn(),
    };
    await expect(Extension.prototype.accountsForget.call({state} as unknown as Extension,
      {address:SUBSTRATE.address,type:'native'})).rejects.toThrow('Public permission write failure');
    expect(state.keyringService.forgetAccount).not.toHaveBeenCalled();
    expect(state.keyringService.forgetAddress).not.toHaveBeenCalled();
    expect(state.walletConnectService.removeSessions).not.toHaveBeenCalled();
    expect(state.setCurrentAccount).not.toHaveBeenCalled();
    expect(state.cleanupDeletedAccount).not.toHaveBeenCalled();
  });
  function forget(removed: MainAccount, remaining: MainAccount[], current = removed) {
    const pair = { meta: removed.meta };
    const state = {
      currentAccount: toCurrentAccountInfo(current) as ReturnType<typeof toCurrentAccountInfo> | null,
      keyringService: {
        currentAccountRevision: 0,
        getPair: () => pair,
        forgetAccount: vi.fn(async (_address: string, beforeRemoval: () => Promise<void>) => beforeRemoval()),
        getAllMainAccounts: () => remaining,
      },
      requestService: { mutateAuthorizations: vi.fn(async (update: (urls: object) => void) => { update({}); return {}; }) },
      walletConnectService: { removeSessions: vi.fn() },
      setCurrentAccount: vi.fn(async (value) => { state.currentAccount = value; state.keyringService.currentAccountRevision++; }),
      updateCurrentAccount: vi.fn(() => true),
      cleanupDeletedAccount: vi.fn(),
    };
    const extension = { state } as unknown as Extension;
    return Extension.prototype.accountsForget.call(extension, { address: removed.address, type: 'native' }).then(() => state);
  }

  it('uses the acknowledged archive-and-remove operation', async () => {
    const state = await forget(SUBSTRATE, [TON]);
    expect(state.keyringService.forgetAccount).toHaveBeenCalledExactlyOnceWith(SUBSTRATE.address, expect.any(Function), expect.any(Function));
  });

  it('reports failure and does not clean up when archive-and-remove rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = {
      currentAccount: toCurrentAccountInfo(SUBSTRATE),
      keyringService: {
        getPair: () => ({ meta: SUBSTRATE.meta }),
        forgetAccount: vi.fn(async () => { throw new Error('QUOTA_BYTES quota exceeded'); }),
        getAllMainAccounts: () => [TON],
      },
      requestService: { mutateAuthorizations: vi.fn() },
      walletConnectService: { removeSessions: vi.fn() },
      setCurrentAccount: vi.fn(), updateCurrentAccount: vi.fn(), cleanupDeletedAccount: vi.fn(),
    };
    const result = await Extension.prototype.accountsForget.call({ state } as unknown as Extension,
      { address: SUBSTRATE.address, type: 'native' });
    expect(result).toBe(false);
    expect(state.setCurrentAccount).not.toHaveBeenCalled();
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(state.cleanupDeletedAccount).not.toHaveBeenCalled();
  });

  it('switches to the next non-EVM account, not a standalone EVM account listed first', async () => {
    const state = await forget(SUBSTRATE, [EVM, TON]);
    expect(state.updateCurrentAccount).toHaveBeenCalledExactlyOnceWith({ address: TON.address, walletEcosystem: WalletEcosystem.Ton });
    expect(state.setCurrentAccount).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('stores the remaining standalone EVM account instead of keeping the removed one selected', async () => {
    const state = await forget(SUBSTRATE, [EVM]);
    expect(state.updateCurrentAccount).not.toHaveBeenCalled();
    expect(state.setCurrentAccount).toHaveBeenNthCalledWith(1, null);
    expect(state.setCurrentAccount).toHaveBeenNthCalledWith(2, expect.objectContaining({
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
