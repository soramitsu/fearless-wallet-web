import { describe, expect, it } from 'vitest';
import type { AccountJson } from '@extension-base/background/types/types';
import type { UniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import { WalletEcosystem } from '@/interfaces';
import { getLegacyWalletUpgradeAccounts } from '@/util/legacyWalletUpgradeNotice';
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

const EVM_ADDRESS = `0x${'ab'.repeat(20)}`;
const SUBSTRATE_ADDRESS = '15FKRtF6nX3SE4PaW4LX69XqYHq2oSep9JX5KF4cgN1XkZ4q';

function legacyAccount(overrides: Partial<AccountJson> = {}): AccountJson {
  return {
    address: SUBSTRATE_ADDRESS,
    ethereumAddress: '',
    name: 'Older account',
    walletEcosystem: WalletEcosystem.Substrate,
    ...overrides,
  };
}

function universalAccount(overrides: Partial<AccountJson> = {}): AccountJson {
  const account = legacyAccount({
    name: 'New account',
    walletSecurityGeneration: 1,
    ethereumAddress: EVM_ADDRESS,
    bitcoinAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    bitcoinTestnetAddress: 'tb1qfmxy27sn8v4d8jwm23qv0a6tq7cyrtn4gk0q88',
    solanaAddress: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
    tonAddress: 'UQDxAUFadQXDd3EXGa3TLF_EF66gMc9h3_aZ0j0zXNoIYUCc',
    tonPublicKeyHex: '22'.repeat(32),
    irohaAddress: 'testuAddressForMigration',
    irohaPublicKeyHex: '11'.repeat(32),
    ...overrides,
  });
  return {
    ...account,
    universalWallet: buildUniversalWalletKeyringMeta({
      address: account.address,
      meta: account,
      nowMillis: 1_710_000_000_100,
    }),
  };
}

describe('legacy wallet upgrade recommendation accounts', () => {
  it('stays quiet for empty installs and newly created universal accounts', () => {
    expect(getLegacyWalletUpgradeAccounts([])).toEqual([]);
    expect(getLegacyWalletUpgradeAccounts([universalAccount()])).toEqual([]);
  });

  it('includes old local accounts without requiring obsolete password flags', () => {
    const account = legacyAccount({ isMasterPassword: true, isMasterAccount: true });
    expect(getLegacyWalletUpgradeAccounts([account])).toEqual([account]);
  });

  it('includes legacy accounts in a mixed installation regardless of account order', () => {
    const current = universalAccount();
    const legacy = legacyAccount({ address: 'older-secondary-address' });
    expect(getLegacyWalletUpgradeAccounts([current, legacy])).toEqual([legacy]);
    expect(getLegacyWalletUpgradeAccounts([legacy, current])).toEqual([legacy]);
  });

  it('retains the recommendation after optional enrollment adds all networks', () => {
    const account = universalAccount({ walletSecurityGeneration: undefined });
    account.universalWallet!.source = 'legacy-import';
    expect(account.universalWallet!.status).toBe('active');
    expect(getLegacyWalletUpgradeAccounts([account])).toEqual([account]);
  });

  it('includes every pre-update local wallet even when metadata says freshly created and universal', () => {
    const account = universalAccount({ walletSecurityGeneration: undefined });
    expect(account.universalWallet).toMatchObject({ source: 'created-24-word', status: 'active' });
    expect(getLegacyWalletUpgradeAccounts([account])).toEqual([account]);
  });

  it('includes incomplete and malformed universal metadata without repairing it', () => {
    const incomplete = legacyAccount();
    incomplete.universalWallet = buildUniversalWalletKeyringMeta({ address: incomplete.address, meta: incomplete });
    const invalid = universalAccount({ walletSecurityGeneration: undefined });
    invalid.universalWallet!.walletId = '../invalid';
    const interrupted = legacyAccount({ universalWallet: { status: 'active' } as UniversalWalletKeyringMeta });
    const accounts = [incomplete, invalid, interrupted];
    const original = JSON.stringify(accounts);
    expect(getLegacyWalletUpgradeAccounts(accounts)).toEqual(accounts);
    expect(JSON.stringify(accounts)).toBe(original);
  });

  it.each(['isExternal', 'isHardware', 'isInjected', 'isMobile', 'isReadOnly', 'isWatchOnly', 'noPublicKey'])(
    'excludes %s accounts even if marked as legacy', (flag) => {
      const account = universalAccount({ [flag]: true, walletSecurityGeneration: undefined });
      account.universalWallet!.source = 'legacy-import';
      expect(getLegacyWalletUpgradeAccounts([account])).toEqual([]);
    }
  );

  it('ignores blank records and the separate master-password record', () => {
    expect(getLegacyWalletUpgradeAccounts([
      legacyAccount({ address: '' }),
      legacyAccount({ address: '  ' }),
      { passwordHash: 'synthetic-password-record' } as unknown as AccountJson,
    ])).toEqual([]);
  });

  it('includes standalone EVM and native TON accounts', () => {
    const evm = legacyAccount({ address: EVM_ADDRESS, ethereumAddress: EVM_ADDRESS, type: 'ethereum', walletEcosystem: WalletEcosystem.Evm });
    const ton = legacyAccount({ address: 'legacy-ton-address', walletEcosystem: WalletEcosystem.Ton, type: 'ton-native' });
    expect(getLegacyWalletUpgradeAccounts([evm, ton])).toEqual([evm, ton]);
  });

  it('counts a linked EVM child with its parent and retains unrelated EVM accounts', () => {
    const parent = legacyAccount({ ethereumAddress: EVM_ADDRESS.toUpperCase() });
    const child = legacyAccount({ address: EVM_ADDRESS, ethereumAddress: EVM_ADDRESS, walletEcosystem: WalletEcosystem.Evm });
    const independent = legacyAccount({ address: `0x${'cd'.repeat(20)}`, type: 'ethereum', walletEcosystem: WalletEcosystem.Evm });
    expect(getLegacyWalletUpgradeAccounts([child, independent, parent])).toEqual([independent, parent]);
    expect(getLegacyWalletUpgradeAccounts([child])).toEqual([child]);
  });

  it('does not mistake a modern account’s linked EVM child for a legacy wallet', () => {
    const parent = universalAccount();
    const child = legacyAccount({ address: EVM_ADDRESS, type: 'ethereum', walletEcosystem: WalletEcosystem.Evm });
    expect(getLegacyWalletUpgradeAccounts([parent, child])).toEqual([]);
  });
});
