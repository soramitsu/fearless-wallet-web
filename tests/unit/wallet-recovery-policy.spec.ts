import { describe, expect, it } from 'vitest';
import { encodeAddress } from '@polkadot/util-crypto';
import { encodeIrohaI105Address } from '@/util/iroha';
import {
  assertWalletAllowsConnection, assertWalletAllowsNormalUse, isSelectedWalletRecoveryOnly, isWalletRecoveryRoute,
  siteMayConnectRecoveryWallets,
} from '@/util/walletRecoveryPolicy';

const old = { address: 'legacy-root', meta: { ethereumAddress: `0x${'ab'.repeat(20)}`, solanaAddress: 'legacy-solana' } };
const fresh = { address: 'new-root', meta: { walletSecurityGeneration: 1 } };

describe('wallet recovery security policy', () => {
  it('lets Polkaswap be shown known public accounts independently of their signing restrictions', () => {
    const imported = { address: 'imported', meta: { walletSecurityGeneration: 0 } };
    const accounts = [old, fresh, imported];
    const before = JSON.stringify(accounts);
    for (const url of ['https://polkaswap.io/#/migration', 'https://polkaswap.io']) {
      for (const account of accounts) expect(() => assertWalletAllowsConnection(accounts, account.address, url)).not.toThrow();
    }
    for (const address of ['', 'unknown']) {
      expect(() => assertWalletAllowsConnection(accounts, address, 'https://polkaswap.io')).toThrow('not available');
    }
    expect(() => assertWalletAllowsNormalUse(accounts, imported.address)).toThrow('recovery-only');
    expect(JSON.stringify(accounts)).toBe(before);
  });
  it('shows existing and imported wallets to no other site, however it names itself', () => {
    const imported = { address: 'imported', meta: { walletSecurityGeneration: 0 } };
    const accounts = [old, fresh, imported];
    for (const url of [
      'https://polkaswap.io.phish.example/#/migration', 'http://polkaswap.io', 'https://www.polkaswap.io',
      'https://polkaswap.io:8443', 'https://dapp.example', 'http://localhost:4173', 'polkaswap.io', '',
    ]) {
      for (const account of [old, imported]) {
        expect(() => assertWalletAllowsConnection(accounts, account.address, url)).toThrow('recovery-only');
      }
      expect(() => assertWalletAllowsConnection(accounts, fresh.address, url)).not.toThrow();
    }
    expect(siteMayConnectRecoveryWallets('https://polkaswap.io/#/migration')).toBe(true);
    expect(siteMayConnectRecoveryWallets('not a url')).toBe(false);
  });
  it('checks the requested old signer even when a fresh wallet is selected', () => {
    for (const address of [old.address, old.meta.ethereumAddress.toUpperCase(), old.meta.solanaAddress]) {
      expect(() => assertWalletAllowsNormalUse([old, fresh], address)).toThrow('recovery-only');
    }
    expect(() => assertWalletAllowsNormalUse([old, fresh], fresh.address)).not.toThrow();
  });

  it('resolves Substrate network-specific address encodings to the same old root', () => {
    const key = new Uint8Array(32).fill(7);
    const account = { address: encodeAddress(key, 42), meta: {} };
    expect(() => assertWalletAllowsNormalUse([account], encodeAddress(key, 0))).toThrow('recovery-only');
  });

  it('fails closed for missing or unknown signing accounts', () => {
    for (const address of ['', 'unknown']) expect(() => assertWalletAllowsNormalUse([fresh], address)).toThrow('recovery-only');
  });

  it('recognizes fresh Iroha accounts on both networks and restricts the same pre-update key', () => {
    const publicKey = 'ab'.repeat(32);
    const taira = encodeIrohaI105Address(publicKey, 'taira');
    const nexus = encodeIrohaI105Address(publicKey, 'nexus');
    for (const identifiers of [{ irohaAddress: taira }, { irohaPublicKeyHex: `0x${publicKey.toUpperCase()}` }]) {
      const account = { address: 'iroha-root', meta: { ...identifiers, walletSecurityGeneration: 1 } };
      for (const address of [taira, nexus]) {
        expect(() => assertWalletAllowsNormalUse([account], address)).not.toThrow();
        expect(() => assertWalletAllowsNormalUse([{ ...account, meta: identifiers }], address)).toThrow('recovery-only');
      }
      const differentKey = encodeIrohaI105Address('cd'.repeat(32), 'nexus');
      expect(() => assertWalletAllowsNormalUse([account], differentKey)).toThrow('recovery-only');
    }
    expect(() => assertWalletAllowsNormalUse([{ address: taira, meta: fresh.meta }], nexus)).not.toThrow();
  });

  it('does not restrict hardware wallets that keep signing outside the extension', () => {
    expect(() => assertWalletAllowsNormalUse([{ address: 'ledger', meta: { isHardware: true } }], 'ledger')).not.toThrow();
  });

  it.each(['Authorize', 'SendForm', 'NftSendForm', 'Export', 'Wallet', 'Currencies', 'Asset', 'Settings', 'AddWallet', 'Unlock', 'Defi', 'Staking', 'MyStake', 'Pools', 'PoolDetails', 'Farming', 'Polkamarkt', 'AccountAccessRecovery', 'StorageRecovery', 'SecurityNotice', 'SecurityNoticeGuide'])(
    'keeps %s accessible for recovery', (route) => { expect(isWalletRecoveryRoute(route)).toBe(true); }
  );

  it.each(['ReceiveForm', 'SoraSwap', 'CrossChain', 'Transaction', 'IrohaConnect', 'UnknownRoute'])(
    'blocks normal use of %s for old wallets', (route) => { expect(isWalletRecoveryRoute(route)).toBe(false); }
  );

  it('changes the navigation policy when a fresh wallet is selected', () => {
    const accounts = [{ ...old.meta, address: old.address, active: true }, { ...fresh.meta, address: fresh.address }];
    expect(isSelectedWalletRecoveryOnly(accounts, old.address)).toBe(true);
    expect(isSelectedWalletRecoveryOnly(accounts, fresh.address)).toBe(false);
    expect(isSelectedWalletRecoveryOnly(accounts.map((account) => ({ ...account, active: false })), '')).toBe(true);
  });
});
