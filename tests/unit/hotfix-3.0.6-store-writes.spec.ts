/** @jest-environment node */
// The keyring library writes account records and the password verifier through these stores. 3.0.6 queues the
// writes (so a password change or reset can wait for them) without changing the keys they are stored under.
import AccountsStore from '../../src/extension/background/extension-base/src/stores/Accounts';
import KeyringStore from '../../src/extension/background/extension-base/src/stores/KeyringStore';
import {
  removeWalletRecords,
  scheduleWalletWrite,
  writeWalletRecords,
} from '../../src/extension/background/extension-base/src/stores/WalletStorage';

jest.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
jest.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: {}, storage: { local: {} } } }));
jest.mock('../../src/extension/background/extension-base/src/stores/WalletStorage', () => ({
  scheduleWalletWrite: jest.fn((write: () => Promise<void>, update?: () => void) => write().then(() => update?.())),
  writeWalletRecords: jest.fn(async () => undefined),
  removeWalletRecords: jest.fn(async () => undefined),
}));

const settle = async () => {
  for (let step = 0; step < 5; step += 1) await Promise.resolve();
};

beforeEach(() => jest.clearAllMocks());

describe('3.0.6: keyring writes are queued under the same storage keys', () => {
  it('queues account records as fw:<key> and runs the library callback', async () => {
    const update = jest.fn();
    const value = { address: 'account', meta: {} } as never;

    new AccountsStore().set('account:0x01', value, update);
    new AccountsStore().remove('account:0x02');
    await settle();
    expect(scheduleWalletWrite).toHaveBeenCalledTimes(2);
    expect(writeWalletRecords).toHaveBeenCalledWith({ 'fw:account:0x01': value });
    expect(removeWalletRecords).toHaveBeenCalledWith(['fw:account:0x02']);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('queues the password verifier as fw:keyring', async () => {
    const verifier = { passwordHash: '0x00' } as never;

    new KeyringStore().set(verifier);
    new KeyringStore().remove();
    await settle();
    expect(scheduleWalletWrite).toHaveBeenCalledTimes(2);
    expect(writeWalletRecords).toHaveBeenCalledWith({ 'fw:keyring': verifier });
    expect(removeWalletRecords).toHaveBeenCalledWith(['fw:keyring']);
  });
});
