import { describe, expect, it } from 'vitest';
import { encodeAddress } from '@polkadot/util-crypto';
import {
  assertWalletAllowsRecoveryAction, isRecoveryStakingAction, isRecoveryPoolAction,
  isRecoveryDemeterAction, isRecoveryPolkamarktAction,
} from '@/util/walletRecoveryActions';

describe('recovery action allowlists', () => {
  it.each([
    [isRecoveryStakingAction, ['unbond', 'redeem', 'payoutRewards'], ['bond', 'bondExtra', 'rebond', 'nominate', 'setPayee', 'setController']],
    [isRecoveryPoolAction, ['removeLiquidity'], ['addLiquidity']],
    [isRecoveryDemeterAction, ['withdraw', 'claim'], ['deposit']],
    [isRecoveryPolkamarktAction, ['sell', 'claimMarket', 'claimCreatorFees'], ['buy']],
  ] as const)('permits only the explicit exit and claim operations for a service', (allows, exits, deposits) => {
    for (const action of exits) expect(allows(action), action).toBe(true);
    for (const action of [...deposits, 'swap', 'sign', '', undefined, null, {}, ['withdraw']]) {
      expect(allows(action)).toBe(false);
    }
  });

  it('requires a stored signer for an exit and keeps normal use blocked for that legacy signer', () => {
    const accounts = [{ address: 'legacy', meta: {} }, { address: 'fresh', meta: { walletSecurityGeneration: 1 } }];
    expect(() => assertWalletAllowsRecoveryAction(accounts, 'legacy', true)).not.toThrow();
    expect(() => assertWalletAllowsRecoveryAction(accounts, 'legacy', false)).toThrow('recovery-only');
    expect(() => assertWalletAllowsRecoveryAction(accounts, 'fresh', false)).not.toThrow();
    expect(() => assertWalletAllowsRecoveryAction(accounts, 'unknown', true)).toThrow('recovery-only');
    expect(() => assertWalletAllowsRecoveryAction(accounts, '', true)).toThrow('recovery-only');
  });

  it('recognizes a recovery signer across SS58 formats without granting normal use', () => {
    const key = new Uint8Array(32).fill(3);
    const accounts = [{ address: encodeAddress(key, 42), meta: {} }];
    expect(() => assertWalletAllowsRecoveryAction(accounts, encodeAddress(key, 69), true)).not.toThrow();
    expect(() => assertWalletAllowsRecoveryAction(accounts, encodeAddress(key, 69), false)).toThrow('recovery-only');
  });
});
