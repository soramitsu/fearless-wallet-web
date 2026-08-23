import type { NetworkScanCoverage } from '@/portfolio/assetIdentity';

const STALE_AFTER_MS = 15 * 60 * 1000;

function milliseconds(timestamp: number): number {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

export function formatSyncAge(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - milliseconds(timestamp));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

export function formatNetworkSyncFreshness(
  {
    coverage,
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
    formatAge = formatSyncAge,
  }: {
    now?: number;
    formatAge?: (timestamp: number, now: number) => string;
  } = {}
): string {
  const age = lastSuccess ? formatAge(milliseconds(lastSuccess), now) : undefined;

  if (error) return age ? `${coverage} · Sync failed · Last synced ${age}` : `${coverage} · Sync failed`;
  if (!lastSuccess) return `${coverage} · Sync pending`;
  if (stale || now - milliseconds(lastSuccess) > STALE_AFTER_MS) {
    return `${coverage} · Stale · Last synced ${age}`;
  }

  return `${coverage} · Synced ${age}`;
}
