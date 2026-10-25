import { describe, expect, it, vi } from 'vitest';
import type { TokenGroup } from '@extension-base/background/types/types';

// The helpers under test are pure; the stores are only used by other exports of the module.
vi.mock('@/stores/networks', () => ({ useNetworksStore: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));

import { calcTransferableSendMinusFee, isValidAmountAsset } from '@/helpers/currencies';
import { addNumbers } from '@/helpers/numbers';
import { getCostOfAssets } from '@/helpers/transfers';

const dot = (transferable: string, isUtility = true): TokenGroup =>
  ({
    groupId: 'dot',
    symbol: 'DOT',
    relayChain: 'polkadot',
    balances: [{ id: 'dot', name: 'Polkadot', symbol: 'DOT', precision: 10, transferable, isUtility, existentialDeposit: '0' }],
  }) as unknown as TokenGroup;

// The wallet's number type reads an empty string as NaN. The Send, Swap, Pool and Staking forms pass empty fields
// while the user types or a fee is quoted, and these helpers were written to count them as 0.
describe('fields that are empty while the form is filled in', () => {
  it('does not call an empty amount or a fee still being quoted an insufficient balance', () => {
    expect(isValidAmountAsset(dot('10'), 'Polkadot', '', '')).toBe(true);
    expect(isValidAmountAsset(dot('10'), 'Polkadot', '', '5')).toBe(true);
    expect(isValidAmountAsset(dot('10'), 'Polkadot', '0.01', '', false, '')).toBe(true);
    expect(calcTransferableSendMinusFee(dot('10'), 'Polkadot', '', false, '')).toBe('10');
  });

  it('still refuses an amount above the balance once the fee is known', () => {
    expect(isValidAmountAsset(dot('10'), 'Polkadot', '0.5', '9.6')).toBe(false);
    expect(isValidAmountAsset(dot('10'), 'Polkadot', '0.5', '9.5')).toBe(true);
    expect(isValidAmountAsset(dot('10', false), 'Polkadot', '0.5', '10.1')).toBe(false);
  });

  it('adds an empty fee as 0 in the Send total', () => {
    expect(addNumbers(['1.5', ''])).toBe('1.5');
    expect(addNumbers([undefined, null, '2'])).toBe('2');
  });

  it('prices an empty amount or fee at 0 rather than NaN', () => {
    expect(getCostOfAssets('', 5)).toBe(0);
    expect(getCostOfAssets('', 5, 'string')).toBe('0');
    expect(getCostOfAssets('2', 5)).toBe(10);
  });
});
