// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { removeWalletRecords } from '@extension-base/stores/WalletStorage';

const mocks = vi.hoisted(() => ({ open: vi.fn(), bridge: vi.fn() }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false }));
vi.mock('@extension-base/stores/WebDatabase', () => ({ openWebDatabase: mocks.open, WEB_STORE_NAME: 'fw-wallet' }));
vi.mock('@/bootstrap/webPasswordStore', () => ({ requestWebPasswordStorage: mocks.bridge }));

beforeEach(() => vi.resetAllMocks());

describe('web reset verifier tombstone', () => {
  it('commits a null verifier with account deletion without deleting legacy recovery bytes', async () => {
    const put = vi.fn();
    const remove = vi.fn();
    const transaction = {
      objectStore: () => ({ put, delete: remove }),
      oncomplete: undefined as undefined | (() => void),
      onerror: undefined as undefined | (() => void),
      onabort: undefined as undefined | (() => void),
    };
    mocks.open.mockResolvedValue({ transaction: () => transaction });
    mocks.bridge.mockRejectedValue(new Error('Synthetic unavailable legacy storage'));
    let finished = false;
    const resetting = removeWalletRecords(['fw:keyring', 'fw:ton:fixture']).then(() => { finished = true; });
    await vi.waitFor(() => expect(put).toHaveBeenCalledWith(null, 'fw:keyring'));
    expect(remove).toHaveBeenCalledExactlyOnceWith('fw:ton:fixture');
    expect(remove).not.toHaveBeenCalledWith('fw:keyring');
    expect(finished).toBe(false);
    transaction.oncomplete!();
    await resetting;
    expect(finished).toBe(true);
    // The committed tombstone prevents fallback to the old verifier; legacy bytes remain available for recovery.
    expect(mocks.bridge).not.toHaveBeenCalled();
  });
});
