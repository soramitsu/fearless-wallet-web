import type { KeyringPair$Json } from '@subwallet/keyring/types';
import { decodeMnemonicFromJsonBackup } from '@/util/keyringJson';

const PASSWORD = 'fearless-solana-smoke-password';
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const json = {
  address: '5EPCUjPxiHAcNooYipQFWr9NmmXJKpNG5RhcntXwbtUySrgH',
  encoded:
    'Tgrlz2GSxnAj1wILkACVGRnphzlP07MO5x03nxHUVPgAAAIAAQAAAAgAAABqLRfX7msBkydmyv+XSx/KG9ZecO0g2iyixTHuBKignB0QY0WWInsnEIIKQWzQxjs5+pN/cfWFvEd2ysvzHB9Ws6pOEAnxnBYntbOYNQNkkxMVMASBPqBV3OrxG6gkMgiX4IU5qauf9B1dIxhJTk4W8zuoRGVyoDQq1ghv9HqjxmOFOP7ot8pKjPn4g6ZqolGR+jhMEpgicsa0zPaa9OiJlWjetkFRIXxn3i4im6ccPEFf',
  encoding: {
    content: ['pkcs8', 'sr25519'],
    type: ['scrypt', 'xsalsa20-poly1305'],
    version: '3',
  },
  meta: {
    genesisHash: '',
    isMasterAccount: true,
    isMasterPassword: true,
    isMobile: false,
    isSubWallet: true,
    name: 'Solana Smoke',
    solanaAddress: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
    walletEcosystem: 'substrate',
    whenCreated: 1,
  },
} as KeyringPair$Json;

describe('decodeMnemonicFromJsonBackup', () => {
  it('recovers a master-password account mnemonic from encrypted JSON entropy', () => {
    expect(decodeMnemonicFromJsonBackup(json, PASSWORD)).toBe(MNEMONIC);
  });

  it('rejects invalid passwords', () => {
    expect(() => decodeMnemonicFromJsonBackup(json, 'wrong-password')).toThrow();
  });
});
