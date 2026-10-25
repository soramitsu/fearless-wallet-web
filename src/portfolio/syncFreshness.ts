import type { NetworkScanCoverage } from '@/portfolio/assetIdentity';

const STALE_AFTER_MS = 15 * 60 * 1000;

export type SyncFreshnessTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

const defaultTranslate: SyncFreshnessTranslator = (key, values = {}) => {
  const count = values.count ?? '';
  const messages: Record<string, string> = {
    'portfolioPage.sync.justNow': 'just now',
    'portfolioPage.sync.minutesAgo': `${count}m ago`,
    'portfolioPage.sync.hoursAgo': `${count}h ago`,
    'portfolioPage.sync.daysAgo': `${count}d ago`,
    'portfolioPage.balanceStatus.failed': 'Balance update failed',
    'portfolioPage.balanceStatus.notLoaded': 'Balances not loaded',
    'portfolioPage.balanceStatus.outdated': 'Balances may be outdated',
  };

  return messages[key] ?? key;
};

function milliseconds(timestamp: number): number {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

export function formatSyncAge(
  timestamp: number,
  now = Date.now(),
  translate: SyncFreshnessTranslator = defaultTranslate
): string {
  const elapsed = Math.max(0, now - milliseconds(timestamp));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return translate('portfolioPage.sync.justNow');
  if (minutes < 60) return translate('portfolioPage.sync.minutesAgo', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate('portfolioPage.sync.hoursAgo', { count: hours });

  return translate('portfolioPage.sync.daysAgo', { count: Math.floor(hours / 24) });
}

export function formatNetworkSyncFreshness(
  {
    lastSuccess,
    stale,
    error,
  }: {
    coverage: NetworkScanCoverage;
    lastSuccess?: number;
    stale: boolean;
    error?: string;
  },
  {
    now = Date.now(),
    translate = defaultTranslate,
  }: {
    now?: number;
    translate?: SyncFreshnessTranslator;
  } = {}
): string {
  if (error?.trim()) return translate('portfolioPage.balanceStatus.failed');
  if (!lastSuccess) return translate(stale ? 'portfolioPage.balanceStatus.failed' : 'portfolioPage.balanceStatus.notLoaded');
  if (stale || now - milliseconds(lastSuccess) > STALE_AFTER_MS) {
    return translate('portfolioPage.balanceStatus.outdated');
  }

  return '';
}
