import {
  transformAccounts,
  transformAddresses,
  transformIrohaAccounts,
  transformSolanaAccounts,
} from '@extension-base/background/helpers/accounts';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { TransformAccountPayload } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';

type AccountFixture = TransformAccountPayload['accounts'][string];

const account = (
  address: string,
  name: string,
  type: AccountFixture['type'],
  whenCreated?: number,
  ethereumAddress?: string,
  solanaAddress?: string,
  walletEcosystem?: WalletEcosystem,
  irohaAddress?: string,
  irohaPublicKeyHex?: string
): AccountFixture =>
  ({
    json: {
      address,
      meta: {
        name,
        whenCreated,
        ethereumAddress,
        irohaAddress,
        irohaPublicKeyHex,
        solanaAddress,
        walletEcosystem,
      },
    },
    type,
  }) as unknown as AccountFixture;

describe('account injection helpers', () => {
  it('filters and sorts injected substrate accounts without leaking ethereum-only entries', () => {
    const accounts = {
      evm: account('0xevm', 'EVM', 'ethereum', 10, '0xevm-authorized'),
      missingCreated: account('substrate-old', 'Old', 'sr25519'),
      substrate: account('substrate-new', 'New', 'sr25519', 20),
      ton: account('ton-address', 'TON', 'ton', 30),
    };

    const result = transformAccounts({ accounts, accountAuthType: 'substrate' });

    expect(result).toEqual([
      { address: 'substrate-old', name: 'Old', type: 'sr25519' },
      { address: 'substrate-new', name: 'New', type: 'sr25519' },
      { address: 'ton-address', name: 'TON', type: undefined },
    ]);
  });

  it('filters injected evm accounts to ethereum keypairs only', () => {
    const accounts = {
      substrate: account('substrate-address', 'Substrate', 'sr25519', 1),
      evm: account('0xevm', 'EVM', 'ethereum', 2, '0xauthorized'),
      ton: account('ton-address', 'TON', 'ton', 3),
    };

    const result = transformAccounts({ accounts, accountAuthType: 'evm' });

    expect(result).toEqual([{ address: '0xevm', name: 'EVM', type: 'ethereum' }]);
  });

  it('uses authorized ethereum addresses for evm address injection', () => {
    const accounts = {
      first: account('0xraw-a', 'A', 'ethereum', 2, '0xauthorized-a'),
      second: account('0xraw-b', 'B', 'ethereum', 1, '0xauthorized-b'),
    };

    const result = transformAddresses({ accounts, accountAuthType: 'evm' });

    expect(result).toEqual([
      { address: '0xauthorized-b', name: 'B', type: 'ethereum', genesisHash: '' },
      { address: '0xauthorized-a', name: 'A', type: 'ethereum', genesisHash: '' },
    ]);
  });

  it('does not mutate the source account map while sorting', () => {
    const accounts = {
      late: account('late-address', 'Late', 'sr25519', 100),
      early: account('early-address', 'Early', 'sr25519', 1),
    };
    const before = JSON.stringify(accounts);

    transformAccounts({ accounts, accountAuthType: 'substrate' });
    transformAddresses({ accounts, accountAuthType: 'substrate' });

    expect(JSON.stringify(accounts)).toBe(before);
  });

  it('extracts only Solana wallet-standard accounts without leaking other ecosystems', () => {
    const accounts = {
      substrate: account(
        'substrate-address',
        'Universal',
        'sr25519',
        1,
        '0xauthorized',
        'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk'
      ),
      solana: account(
        '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w',
        'Solana',
        'sr25519',
        2,
        undefined,
        undefined,
        WalletEcosystem.Solana
      ),
      evm: account('0xevm', 'EVM', 'ethereum', 3, '0xauthorized'),
      invalidSolana: account('bad-address', 'Invalid', 'sr25519', 4, undefined, 'not-base58'),
    };

    const result = transformSolanaAccounts({ accounts });

    expect(result).toEqual([
      {
        address: '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w',
        name: 'Solana',
        publicKey: '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w',
      },
      {
        address: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
        name: 'Universal',
        publicKey: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
      },
    ]);
  });

  it('extracts Iroha accounts for the requested Taira or Nexus network', () => {
    const { nexus, taira } = vectors.vectors[0].expected.iroha;
    const accounts = {
      universal: account(
        'substrate-address',
        'Universal',
        'sr25519',
        1,
        '0xauthorized',
        'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
        WalletEcosystem.Iroha,
        taira.i105,
        taira.publicKeyHex
      ),
      invalidIroha: account('bad-address', 'Invalid', 'sr25519', 2, undefined, undefined, WalletEcosystem.Iroha),
      solana: account(
        '5Pobwp6d9ihN9Nz38f87gVCEBFMgipFiSM2VtUhVit6w',
        'Solana',
        'sr25519',
        3,
        undefined,
        undefined,
        WalletEcosystem.Solana
      ),
    };

    expect(transformIrohaAccounts({ accounts }, 'nexus')).toEqual([
      {
        address: nexus.i105,
        chain: 'sora:nexus',
        name: 'Universal',
        network: 'nexus',
        publicKeyHex: nexus.publicKeyHex,
      },
    ]);
    expect(transformIrohaAccounts({ accounts }, 'taira')).toEqual([
      {
        address: taira.i105,
        chain: 'iroha:taira',
        name: 'Universal',
        network: 'taira',
        publicKeyHex: taira.publicKeyHex,
      },
    ]);
  });
});
