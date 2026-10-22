import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beforeAll } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { tonStore } from '@extension-base/stores/TonStore';
import Extension from '@extension-base/background/handlers/Extension';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import type State from '@extension-base/background/handlers/State';
import type { KeyringService } from '@extension-base/services/keyring-service';
import { deriveTonAccount } from '@/util/tonKeyring';

// Keep the real unlock handler, while excluding unrelated network/signing
// subsystems from this offline regression test.
vi.mock('@sora-substrate/util', () => ({}));
vi.mock('@extension-base/api/evm/transfer', () => ({}));
vi.mock('@extension-base/api/bitcoin/transfer', () => ({}));
vi.mock('@extension-base/api/iroha/transfer', () => ({}));
vi.mock('@extension-base/api/iroha/productionTransferCodec', () => ({}));
vi.mock('@extension-base/api/solana/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/transfer', () => ({}));
vi.mock('@extension-base/api/substrate/sora', () => ({}));
vi.mock('@extension-base/api/substrate/crossChain', () => ({}));
vi.mock('@extension-base/api/substrate/typeRegistry', () => ({}));
vi.mock('@extension-base/api/ton/transfer', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/utils', () => ({}));
vi.mock('@extension-base/services/wallet-connect-service/consts', () => ({}));
vi.mock('@extension-base/services/request-service/handlers/solanaSigning', () => ({}));
vi.mock('@extension-base/services/polkamarkt-service', () => ({}));
vi.mock('@extension-base/background/helpers/balance', () => ({}));
vi.mock('@extension-base/background/helpers', () => ({}));
vi.mock('@extension-base/background/handlers/utils', () => ({}));
vi.mock('@/helpers', () => ({}));
vi.mock('@/consts/currencies', () => ({}));
vi.mock('@/consts/networks', () => ({}));
vi.mock('@/cross-chain/requestValidation', () => ({}));
vi.mock('@/defi/polkaswapExecutionGuard', () => ({}));
vi.mock('@extension-base/const', () => ({}));
vi.mock('@extension-base/background/handlers/ExtensionBase', () => ({
  default: class {
    constructor(protected state: State) {}
  },
}));
vi.mock('@extension-base/stores/TonStore', () => ({ tonStore: { readAll: vi.fn(), saveMany: vi.fn() } }));
beforeAll(() => cryptoWaitReady());

const TEST_PASSWORD = 'public-regression-fixture-password';
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const forbiddenNetwork = vi.fn(() => {
  throw new Error('Network access is forbidden in this test');
});

beforeEach(() => {
  vi.useFakeTimers();
  forbiddenNetwork.mockClear();
  vi.stubGlobal('fetch', forbiddenNetwork);
  vi.stubGlobal('XMLHttpRequest', forbiddenNetwork);
  vi.stubGlobal('WebSocket', forbiddenNetwork);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('unlock must not upload wallet secrets', () => {
  it.each([true, false])('returns %s without invoking legacy collection or upload hooks', async (unlocked) => {
    const forbiddenSecretAccess = vi.fn(() => {
      throw new Error('Unlock must not export wallet secrets');
    });
    const upload = vi.fn(() => {
      throw new Error('The removed upload hook must never be invoked');
    });
    const unlockKeyring = vi.fn(() => unlocked);
    const setExtensionAutoLockTimeout = vi.fn();
    const state = {
      keyringLockService: { setExtensionAutoLockTimeout },
      keyringService: {
        unlockKeyring,
        getDataAccounts: forbiddenSecretAccess,
        exportMnemonic: forbiddenSecretAccess,
        accountExportPrivateKey: forbiddenSecretAccess,
        backupAccount: forbiddenSecretAccess,
        getAllMainAccounts: forbiddenSecretAccess,
      },
      balanceService: { tonBalanceService: { fetchJettonInfo: upload } },
    } as unknown as State;
    const request = { password: TEST_PASSWORD };

    expect(await new Extension(state).unlockKeyring(request)).toBe(unlocked);
    // The removed upload waited ten seconds after reading its remote switch.
    await vi.advanceTimersByTimeAsync(30_000);

    expect(unlockKeyring).toHaveBeenCalledExactlyOnceWith(request);
    expect(setExtensionAutoLockTimeout).toHaveBeenCalledOnce();
    expect(upload).not.toHaveBeenCalled();
    expect(forbiddenSecretAccess).not.toHaveBeenCalled();
    expect(forbiddenNetwork).not.toHaveBeenCalled();
  });

  it('preserves authenticated TON mnemonic recovery entirely locally', async () => {
    const identity = deriveTonAccount({ mnemonic: TEST_MNEMONIC });
    vi.mocked(tonStore.readAll).mockResolvedValue([]);
    const tonKeyring = new TonKeyringService({ getPassword: () => TEST_PASSWORD } as KeyringService);
    await tonKeyring.withStoreLock(async () => {});
    const ciphertext = tonKeyring.encodeMnemonic(TEST_MNEMONIC.split(' '), TEST_PASSWORD);
    tonKeyring.setAccounts({ address: identity.address, name: 'Public fixture', publicKeyHex: identity.publicKeyHex, cipherSeed: ciphertext });
    expect(ciphertext).not.toContain(TEST_MNEMONIC);
    expect(JSON.parse(ciphertext).version).toBe(2);
    expect(await tonKeyring.decodeAccountMnemonic(identity.address)).toBe(TEST_MNEMONIC);
    await expect(tonKeyring.decodeAccountMnemonic(identity.address, '')).rejects.toThrow();
    await expect(tonKeyring.decodeAccountMnemonic(identity.address, 'wrong')).rejects.toThrow();
    expect(forbiddenNetwork).not.toHaveBeenCalled();
  });
});
