import type { HistoryFetchRequest, BaseHistoryServiceType, TonEvent, TonEventTokens } from '@/interfaces';
import { BASE_HISTORY_SERVICE_TYPES } from '@/interfaces/networks';

const HISTORY_SERVICE_SET = new Set<BaseHistoryServiceType>(BASE_HISTORY_SERVICE_TYPES);

export const normalizeHistoryServiceType = (
  type: HistoryFetchRequest['endpoint']['type']
): BaseHistoryServiceType | null => {
  if (HISTORY_SERVICE_SET.has(type as BaseHistoryServiceType)) {
    return type as BaseHistoryServiceType;
  }

  const normalized = type.toLowerCase();

  if (!normalized.startsWith('staking')) return null;

  const candidate = normalized.slice('staking'.length);

  if (candidate && HISTORY_SERVICE_SET.has(candidate as BaseHistoryServiceType)) {
    return candidate as BaseHistoryServiceType;
  }

  return null;
};

export const pickTonAssetHistory = (tokens: TonEventTokens | undefined, assetId: string): TonEvent[] => {
  if (!tokens) return [];

  const direct = tokens[assetId];
  if (direct) return direct;

  const lower = tokens[assetId.toLowerCase() as keyof TonEventTokens];
  if (lower) return lower as TonEvent[];

  const upper = tokens[assetId.toUpperCase() as keyof TonEventTokens];
  if (upper) return upper as TonEvent[];

  return [];
};
