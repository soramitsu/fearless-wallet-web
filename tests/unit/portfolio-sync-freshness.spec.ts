import { formatNetworkSyncFreshness, formatSyncAge } from '@/portfolio/syncFreshness';

describe('Portfolio network sync freshness', () => {
  const now = Date.UTC(2026, 7, 1, 12, 0, 0);

  it('shows a useful relative age for a successful scan', () => {
    expect(
      formatNetworkSyncFreshness(
        { coverage: 'complete', lastSuccess: now - 2 * 60_000, stale: false },
        { now }
      )
    ).toBe('complete · Synced 2m ago');
  });

  it('retains and renders the last successful time after an endpoint error', () => {
    expect(
      formatNetworkSyncFreshness(
        {
          coverage: 'catalogOnly',
          lastSuccess: now - 3 * 60 * 60_000,
          stale: true,
          error: 'endpoint_unavailable',
        },
        { now }
      )
    ).toBe('catalogOnly · Sync failed · Last synced 3h ago');
  });

  it('marks old successes stale and supports an injected timestamp formatter', () => {
    const formatAge = vi.fn((timestamp: number) => `at ${new Date(timestamp).toISOString()}`);

    expect(
      formatNetworkSyncFreshness(
        { coverage: 'limited', lastSuccess: now - 20 * 60_000, stale: false },
        { now, formatAge }
      )
    ).toBe(`limited · Stale · Last synced at ${new Date(now - 20 * 60_000).toISOString()}`);
    expect(formatAge).toHaveBeenCalledWith(now - 20 * 60_000, now);
  });

  it('normalizes second timestamps and reports pending scans honestly', () => {
    expect(formatSyncAge((now - 60_000) / 1000, now)).toBe('1m ago');
    expect(formatNetworkSyncFreshness({ coverage: 'limited', stale: false }, { now })).toBe(
      'limited · Sync pending'
    );
  });
});
