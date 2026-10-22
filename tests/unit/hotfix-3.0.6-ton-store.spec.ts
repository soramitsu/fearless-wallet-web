/** @jest-environment node */
// TonStore.readAll is what the TON keyring loads at start-up. A record it cannot use must not hide the others.
import { tonStore } from '../../src/extension/background/extension-base/src/stores/TonStore';
import { readWalletRecords } from '../../src/extension/background/extension-base/src/stores/WalletStorage';

jest.mock('@/consts/global', () => ({ IS_EXTENSION: true }));
jest.mock('../../src/extension/background/extension-base/src/stores/WalletStorage', () => ({
  readWalletRecords: jest.fn(),
  writeWalletRecords: jest.fn(),
}));

const KEY = '0'.repeat(64);
const record = (address: string, publicKeyHex = KEY) => ({ name: address, address, cipherSeed: 'x', publicKeyHex });

describe('3.0.6: TON records are loaded one by one', () => {
  it('lists the valid records and skips one in an unknown layout', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (readWalletRecords as jest.Mock).mockResolvedValue({
      'fw:ton:first': record('first'),
      'fw:ton:second': record('second', 'not hex'),
      'fw:ton:third': record('somewhere else'),
      'fw:ton:fourth': null,
      'fw:account:0x00': { address: 'not a TON record' },
      'fw:ton:fifth': record('fifth'),
    });

    await expect(tonStore.readAll()).resolves.toEqual([record('first'), record('fifth')]);
  });

  it('still rejects when storage itself cannot be read', async () => {
    (readWalletRecords as jest.Mock).mockRejectedValue(new Error('Cannot read wallet storage'));

    await expect(tonStore.readAll()).rejects.toThrow('Cannot read wallet storage');
  });
});
