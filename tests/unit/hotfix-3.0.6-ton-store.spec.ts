// @vitest-environment node
import { describe, it, expect, vi, type Mock } from 'vitest';
// TonStore.readAll is what the TON keyring loads at start-up. A record it cannot use must not hide the others.
import { tonStore } from '../../src/extension/background/extension-base/src/stores/TonStore';
import { readWalletRecords, writeWalletRecords } from '../../src/extension/background/extension-base/src/stores/WalletStorage';

vi.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
vi.mock('../../src/extension/background/extension-base/src/stores/WalletStorage', () => ({
  readWalletRecords: vi.fn(),
  writeWalletRecords: vi.fn(),
}));

const KEY = '0'.repeat(64);
const record = (address: string, publicKeyHex = KEY) => ({ name: address, address, cipherSeed: 'x', publicKeyHex });

describe('3.0.6: TON records are loaded one by one', () => {
  it('lists the valid records and skips one in an unknown layout', async () => {
    (readWalletRecords as Mock).mockResolvedValue({
      'fw:ton:first': record('first'),
      'fw:ton:second': record('second', 'not hex'),
      'fw:ton:third': record('somewhere else'),
      'fw:ton:fourth': null,
      'fw:account:0x00': { address: 'not a TON record' },
      'fw:ton:fifth': record('fifth'),
    });

    await expect(tonStore.readAll()).resolves.toEqual([record('first'), record('fifth')]);
    expect(tonStore.hasUnreadableRecords).toBe(true);
    expect(writeWalletRecords).not.toHaveBeenCalled();
    vi.mocked(readWalletRecords).mockResolvedValue({ 'fw:ton:first': record('first') });
    await tonStore.readAll();
    expect(tonStore.hasUnreadableRecords).toBe(false);
  });

  it('still rejects when storage itself cannot be read', async () => {
    (readWalletRecords as Mock).mockRejectedValue(new Error('Cannot read wallet storage'));

    await expect(tonStore.readAll()).rejects.toThrow('Cannot read wallet storage');
  });
});
