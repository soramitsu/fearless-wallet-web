import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isProposalExpired } from '@extension-base/services/wallet-connect-service/utils';
import type { ProposalTypes } from '@walletconnect/types';

// The wallet's own WalletConnect SDK writes a proposal's deadline: 2.10 and older (Fearless 3.0) as expiry, 2.13 and
// later (2.23 here) as expiryTimestamp in seconds, the dApp's or its own default, with no expiry.
const NOW = Date.UTC(2026, 10, 3, 12);
const seconds = NOW / 1000;
const proposal = (deadlines: Record<string, unknown>) => deadlines as unknown as ProposalTypes.Struct;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('WalletConnect proposal expiry', () => {
  it.each([
    ['a current proposal before its expiryTimestamp', { expiryTimestamp: seconds + 300 }, false],
    ['a current proposal at its expiryTimestamp', { expiryTimestamp: seconds }, true],
    ['a current proposal after its expiryTimestamp', { expiryTimestamp: seconds - 1 }, true],
    ['expiryTimestamp over a later expiry', { expiryTimestamp: seconds - 1, expiry: seconds + 300 }, true],
    ['expiryTimestamp over an earlier expiry', { expiryTimestamp: seconds + 300, expiry: seconds - 1 }, false],
    ['a 2.10-style proposal before its expiry', { expiry: seconds + 300 }, false],
    ['a 2.10-style proposal after its expiry', { expiry: seconds - 1 }, true],
    ['an expiry in milliseconds', { expiry: NOW + 300_000 }, false],
    ['a proposal with neither deadline', {}, true],
  ])('judges %s', (_, deadlines, expired) => {
    expect(isProposalExpired(proposal(deadlines))).toBe(expired);
  });

  it.each([
    ['zero', 0],
    ['null', null],
    ['NaN', NaN],
    ['infinite', Infinity],
    ['a numeric string', String(seconds + 300)],
  ])('refuses a deadline that is %s', (_, deadline) => {
    expect(isProposalExpired(proposal({ expiryTimestamp: deadline }))).toBe(true);
    expect(isProposalExpired(proposal({ expiry: deadline }))).toBe(true);
  });
});
