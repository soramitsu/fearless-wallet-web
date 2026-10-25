import { describe, expect, it } from 'vitest';
import { WalletSecurityProvenance, withoutWalletSecurityClaims } from '@extension-base/services/keyring-service/WalletSecurityProvenance';
import { isWalletGenerationExpired } from '@/util/walletSecurity';

const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const flags = ['isExternal', 'isHardware', 'isInjected', 'isMobile', 'isReadOnly', 'isWatchOnly', 'noPublicKey'];
const claims = { name: 'Imported', walletSecurityGeneration: 1, ...Object.fromEntries(flags.map((flag) => [flag, true])) };

describe('wallet generation provenance', () => {
  it('recognizes only roots generated in the current background and their derivations', () => {
    const provenance = new WalletSecurityProvenance();
    expect(provenance.accountMetadata(phrase, claims).walletSecurityGeneration).toBeUndefined();
    provenance.rememberGeneratedMnemonic(phrase);
    expect(provenance.accountMetadata(`${phrase}//0`, {}, true).walletSecurityGeneration).toBe(1);
    expect(provenance.accountMetadata(`${phrase}/m/44'/60'/0'/0/0`, {}, true).walletSecurityGeneration).toBe(1);
    expect(new WalletSecurityProvenance().accountMetadata(phrase, claims).walletSecurityGeneration).toBeUndefined();
  });

  it('removes caller claims without mutating backup metadata', () => {
    const clean = withoutWalletSecurityClaims(claims);
    expect(clean).toEqual({ name: 'Imported' });
    expect(claims.walletSecurityGeneration).toBe(1);
    for (const flag of flags) expect(claims[flag]).toBe(true);
  });

  it('rejects a create request after background restart instead of creating an imported wallet', () => {
    try {
      new WalletSecurityProvenance().accountMetadata(phrase, claims, true);
      throw new Error('Expected generation to expire');
    } catch (error) {
      expect(isWalletGenerationExpired(error)).toBe(true);
    }
  });

  it('bounds abandoned generations and leaves both sibling derivations available', () => {
    const provenance = new WalletSecurityProvenance();
    for (let i = 0; i < 33; i++) provenance.rememberGeneratedMnemonic(`public-fixture-${i}`);
    expect(provenance.accountMetadata('public-fixture-0', {}).walletSecurityGeneration).toBeUndefined();
    expect(provenance.accountMetadata('public-fixture-32//0', {}, true).walletSecurityGeneration).toBe(1);
    expect(provenance.accountMetadata("public-fixture-32/m/44'/60'/0'/0/0", {}, true).walletSecurityGeneration).toBe(1);
  });
});
