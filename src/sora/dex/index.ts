import { DexId } from './consts';
import { XOR, XST } from '../assets/consts';

import type { Api } from '../api';
import type { DexInfo } from './types';
import type { LiquiditySourceTypes } from '@sora/liquidityProxy';

type UnknownRecord = Record<string | number | symbol, unknown>;

const isStorageKey = (value: unknown): value is { args: unknown[] } =>
  typeof value === 'object' && value !== null && Array.isArray((value as { args?: unknown[] }).args);

const isNumberLike = (value: unknown): value is { toNumber(): number } =>
  typeof value === 'object' && value !== null && typeof (value as { toNumber?: () => number }).toNumber === 'function';

const isLiquiditySourceCodec = (value: unknown): value is { toString(): string } =>
  typeof value === 'object' && value !== null && typeof (value as { toString?: () => string }).toString === 'function';

const mapIterable = <T>(value: unknown, predicate: (item: unknown) => item is T): T[] => {
  if (Array.isArray(value)) {
    return value.filter(predicate);
  }

  if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return Array.from(value as Iterable<unknown>).filter(predicate);
  }

  return [];
};

const extractAssetId = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (value && typeof (value as UnknownRecord).code === 'object') {
    const code = (value as UnknownRecord).code;

    if (code && typeof (code as { toString?: () => string }).toString === 'function') {
      return (code as { toString(): string }).toString();
    }
  }

  return null;
};

const extractDexInfo = (key: unknown, codec: unknown): DexInfo | null => {
  if (!isStorageKey(key)) return null;

  const [maybeDexId] = key.args;
  if (!isNumberLike(maybeDexId)) return null;

  if (typeof codec !== 'object' || codec === null) return null;
  const value = (codec as UnknownRecord).value as UnknownRecord | undefined;
  if (!value) return null;

  const baseAssetId = extractAssetId(value.baseAssetId ?? (value as UnknownRecord).base_asset_id);
  const syntheticBaseAssetId = extractAssetId(
    value.syntheticBaseAssetId ?? (value as UnknownRecord).synthetic_base_asset_id
  );
  const isPublicFlag = value.isPublic ?? (value as UnknownRecord).is_public;

  const isPublic = Boolean((isPublicFlag as { isTrue?: boolean })?.isTrue ?? isPublicFlag);

  if (!baseAssetId || !syntheticBaseAssetId) return null;

  return {
    dexId: maybeDexId.toNumber(),
    baseAssetId,
    syntheticBaseAssetId,
    isPublic,
  };
};

const mapLiquiditySources = (value: unknown): LiquiditySourceTypes[] =>
  mapIterable(value, isLiquiditySourceCodec).map((item) => item.toString() as LiquiditySourceTypes);

export class DexModule<T> {
  constructor(private readonly root: Api<T>) {}

  public static readonly defaultDexId = DexId.XOR;
  public static readonly defaultBaseAssetId = XOR.address;
  public static readonly defaultSyntheticAssetId = XST.address;

  public dexList: DexInfo[] = [];
  public lockedSources: LiquiditySourceTypes[] = [];
  public enabledSources: LiquiditySourceTypes[] = [];

  get publicDexes(): DexInfo[] {
    return this.dexList.filter((dex) => dex.isPublic);
  }

  get poolBaseAssetsIds(): string[] {
    return this.publicDexes.map((item) => item.baseAssetId);
  }

  get baseAssetsIds(): string[] {
    return this.dexList.map((item) => item.baseAssetId);
  }

  public async update(): Promise<void> {
    await Promise.allSettled([this.updateList(), this.updateEnabledSources(), this.updateLockedSources()]);
  }

  public async updateList(): Promise<void> {
    const entries = await this.root.api.query.dexManager.dexInfos.entries();

    this.dexList = entries
      .map(([key, codec]) => extractDexInfo(key, codec))
      .filter((info): info is DexInfo => info !== null);
  }

  public async updateLockedSources(): Promise<void> {
    const sources = await this.root.api.query.tradingPair.lockedLiquiditySources();

    this.lockedSources = mapLiquiditySources(sources);
  }

  public async updateEnabledSources(): Promise<void> {
    const sources = await this.root.api.query.dexapi.enabledSourceTypes();

    this.enabledSources = mapLiquiditySources(sources);
  }

  public getDexId(baseAssetId: string): number {
    return this.dexList.find((dex) => dex.baseAssetId === baseAssetId)?.dexId ?? DexModule.defaultDexId;
  }

  public getBaseAssetId(dexId: number): string {
    return this.dexList.find((dex) => dex.dexId === dexId)?.baseAssetId ?? DexModule.defaultBaseAssetId;
  }

  public getSyntheticBaseAssetId(dexId: number): string {
    return this.dexList.find((dex) => dex.dexId === dexId)?.syntheticBaseAssetId ?? DexModule.defaultSyntheticAssetId;
  }
}
