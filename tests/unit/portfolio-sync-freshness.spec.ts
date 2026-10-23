import { formatNetworkSyncFreshness, formatSyncAge } from '@/portfolio/syncFreshness';

describe('Portfolio network sync freshness', () => {
  const now = Date.UTC(2026, 7, 1, 12, 0, 0);

  it.each(['complete', 'catalogOnly', 'limited'] as const)('keeps successful %s scans quiet', (coverage) => {
    expect(formatNetworkSyncFreshness({ coverage, lastSuccess: now - 2 * 60_000, stale: false }, { now })).toBe('');
  });

  it.each([undefined, now - 3 * 60 * 60_000])('keeps an update failure visible with last success %s', (lastSuccess) => {
    expect(formatNetworkSyncFreshness({ coverage: 'catalogOnly', lastSuccess, stale: true, error: 'endpoint_unavailable' }, { now }))
      .toBe('Balance update failed');
  });

  it('marks old successes outdated without repeating timestamps or discovery coverage', () => {
    expect(formatNetworkSyncFreshness({ coverage: 'limited', lastSuccess: now - 20 * 60_000, stale: false }, { now }))
      .toBe('Balances may be outdated');
    expect(formatNetworkSyncFreshness({ coverage: 'complete', lastSuccess: now, stale: true }, { now }))
      .toBe('Balances may be outdated');
  });

  it('distinguishes unloaded balances from a failed first scan', () => {
    expect(formatNetworkSyncFreshness({ coverage: 'limited', stale: false }, { now })).toBe('Balances not loaded');
    expect(formatNetworkSyncFreshness({ coverage: 'limited', stale: true }, { now })).toBe('Balance update failed');
  });

  it('normalizes second timestamps while leaving a healthy heading quiet', () => {
    expect(formatSyncAge((now - 60_000) / 1000, now)).toBe('1m ago');
    expect(formatNetworkSyncFreshness({ coverage: 'limited', lastSuccess: (now - 60_000) / 1000, stale: false }, { now }))
      .toBe('');
  });
});
