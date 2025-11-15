import { assert, stringToU8a, u8aToHex, bnToU8a } from '@polkadot/util';
import { Observable, Subscription, Subject, combineLatest, map } from 'rxjs';
import { keccak256AsU8a } from '@polkadot/util-crypto';
import { CodecString, FPNumber, NumberLike } from '@sora/math';
import type { ApiPromise } from '@polkadot/api';
import type { StorageEntryBase } from '@polkadot/api-base/types/storage';
import type { Option, u128 } from '@polkadot/types-codec';
import type { SubmittableExtrinsic } from '@polkadot/api-base/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AnyFunction, Codec } from '@polkadot/types/types';

import { KnownAssets, NativeAssets, XOR } from './consts';
import { DexId } from '../dex/consts';
import { PoolTokens } from '../poolXyk/consts';
import { Messages } from '../logger';
import { Operation, History } from '../types';
import type {
  AccountAsset,
  AccountBalance,
  Asset,
  Blacklist,
  HistoryElementTransfer,
  TransferOptions,
  Whitelist,
  WhitelistArrayItem,
  WhitelistIdsBySymbol,
} from './types';
import type { Api } from '../api';

type AssetIdCodec = {
  code: {
    toString(): string;
  };
};

type AssetIdInput = AssetIdCodec | { toString(): string };

type AssetInfoHuman = [string, string, string | number, boolean, unknown, unknown];

type AssetInfoCodec = {
  toHuman(): AssetInfoHuman;
};

type StorageKeyLike<T = unknown> = {
  args: [T, ...unknown[]];
};

type BalanceDataLike = {
  free?: unknown;
  reserved?: unknown;
  frozen?: unknown;
  miscFrozen?: unknown;
  feeFrozen?: unknown;
};

type AccountInfoLike = {
  data: BalanceDataLike;
};

type AssetsTxRegisterArgs = [string, string, string, boolean, boolean, string | null, string | null];

type AssetsTxSection = {
  register(...args: AssetsTxRegisterArgs): SubmittableExtrinsic<'promise'>;
  transfer(assetId: string, to: string, amount: string): SubmittableExtrinsic<'promise'>;
  mint(assetId: string, to: string, amount: string): SubmittableExtrinsic<'promise'>;
  burn(assetId: string, amount: string): SubmittableExtrinsic<'promise'>;
};

type FilterMode = 'Disabled' | 'AllowSelected' | 'ForbidSelected';

type LiquidityProxyTxSection = {
  xorlessTransfer(
    dexId: number,
    assetAddress: string,
    to: string,
    amount: string,
    desiredXor: NumberLike,
    maxAmountIn: NumberLike,
    selectedSources: unknown[],
    filterMode: FilterMode,
    comment: string | null
  ): SubmittableExtrinsic<'promise'>;
};

type AssetsRpcSection = {
  listAssetIds(): Promise<Array<{ toString(): string }>>;
  usableBalance(accountAddress: string, assetAddress: string): Promise<Option<Codec>>;
};

type AnyStorageEntry = StorageEntryBase<'promise', AnyFunction>;

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === 'function';

const isAssetIdCodec = (value: AssetIdInput): value is AssetIdCodec =>
  typeof value === 'object' && value !== null && 'code' in value && typeof value.code?.toString === 'function';

const isAssetInfoCodec = (value: unknown): value is AssetInfoCodec =>
  typeof value === 'object' && value !== null && isFunction((value as AssetInfoCodec).toHuman);

const expectAssetInfoCodec = (value: unknown, errorMessage: string): AssetInfoCodec => {
  assert(isAssetInfoCodec(value), errorMessage);

  return value;
};

const isAssetsRpcSection = (value: unknown): value is AssetsRpcSection =>
  typeof value === 'object' &&
  value !== null &&
  isFunction((value as AssetsRpcSection).listAssetIds) &&
  isFunction((value as AssetsRpcSection).usableBalance);

const hasAssetsRpcSection = (value: unknown): value is { assets: AssetsRpcSection } => {
  if (typeof value !== 'object' || value === null || !('assets' in value)) return false;

  const { assets } = value as { assets?: unknown };

  return isAssetsRpcSection(assets);
};

const isAssetsTxSection = (value: unknown): value is AssetsTxSection =>
  typeof value === 'object' &&
  value !== null &&
  isFunction((value as AssetsTxSection).register) &&
  isFunction((value as AssetsTxSection).transfer) &&
  isFunction((value as AssetsTxSection).mint) &&
  isFunction((value as AssetsTxSection).burn);

const hasAssetsTxSection = (value: unknown): value is { assets: AssetsTxSection } => {
  if (typeof value !== 'object' || value === null || !('assets' in value)) return false;

  const { assets } = value as { assets?: unknown };

  return isAssetsTxSection(assets);
};

const isLiquidityProxyTxSection = (value: unknown): value is LiquidityProxyTxSection =>
  typeof value === 'object' && value !== null && isFunction((value as LiquidityProxyTxSection).xorlessTransfer);

const hasLiquidityProxyTxSection = (value: unknown): value is { liquidityProxy: LiquidityProxyTxSection } => {
  if (typeof value !== 'object' || value === null || !('liquidityProxy' in value)) return false;

  const { liquidityProxy } = value as { liquidityProxy?: unknown };

  return isLiquidityProxyTxSection(liquidityProxy);
};

const toNumberLike = (value: unknown): NumberLike => {
  if (value instanceof FPNumber) return value;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (value && typeof (value as { toString(): string }).toString === 'function') {
    return (value as { toString(): string }).toString();
  }
  return 0;
};

export function toAssetId(asset: AssetIdInput): string {
  return isAssetIdCodec(asset) ? asset.code.toString() : asset.toString();
}

const toObservableArray = <T>(value: unknown): Observable<T>[] => {
  if (Array.isArray(value)) return value as Observable<T>[];
  if (value && typeof (value as { values?: () => Iterable<Observable<T>> }).values === 'function') {
    return Array.from((value as { values: () => Iterable<Observable<T>> }).values());
  }
  return [];
};

const isOption = <T extends Codec>(value: unknown): value is Option<T> =>
  typeof value === 'object' &&
  value !== null &&
  'isSome' in value &&
  typeof (value as { isSome: unknown }).isSome === 'boolean' &&
  typeof (value as Option<T>).unwrap === 'function';

const asBalanceData = (value: unknown): BalanceDataLike => {
  if (typeof value === 'object' && value !== null) return value as BalanceDataLike;
  return {};
};

const asAccountInfo = (value: unknown): AccountInfoLike => {
  if (typeof value === 'object' && value !== null && 'data' in value) return value as AccountInfoLike;
  return { data: {} };
};

const unwrapOptionOr = <T extends Codec>(value: Option<T> | unknown, fallback: T): T => {
  if (!isOption<T>(value)) return fallback;
  return value.isSome ? value.unwrap() : fallback;
};

const isStorageEntry = (value: unknown): value is AnyStorageEntry => {
  return typeof value === 'object' && value !== null && typeof (value as { at?: unknown }).at === 'function';
};

export function formatBalance(
  data: BalanceDataLike,
  assetDecimals?: number,
  bondedData?: Option<u128>
): AccountBalance {
  const free = new FPNumber(toNumberLike(data.free), assetDecimals);
  const reserved = new FPNumber(toNumberLike(data.reserved), assetDecimals);
  const miscFrozen = new FPNumber(toNumberLike(data.miscFrozen), assetDecimals);
  const feeFrozen = new FPNumber(toNumberLike(data.feeFrozen), assetDecimals);
  const frozenDeprecated = miscFrozen.max(feeFrozen);
  const frozenCurrent = new FPNumber(toNumberLike(data.frozen), assetDecimals);
  const frozen = frozenCurrent.max(frozenDeprecated);
  const transferable = free.sub(frozen);
  const bondedValue = bondedData && !bondedData.isEmpty ? bondedData.unwrap() : 0;
  const bonded = new FPNumber(toNumberLike(bondedValue), assetDecimals);
  const locked = reserved.add(frozen).add(bonded);

  return {
    free: free.toCodecString(),
    reserved: reserved.toCodecString(),
    frozen: frozen.toCodecString(),
    bonded: bonded.toCodecString(),
    locked: locked.toCodecString(),
    total: transferable.add(locked).toCodecString(),
    transferable: transferable.toCodecString(),
  };
}

async function getAssetInfo(api: ApiPromise, address: string): Promise<Asset> {
  const storageEntry = await api.query.assets.assetInfos({ code: address });

  const codec = expectAssetInfoCodec(storageEntry, Messages.assetsNotExists);
  const [symbol, name, decimals, isMintable, content, description] = codec.toHuman() as AssetInfoHuman;

  const decimalsNumber = typeof decimals === 'number' ? decimals : Number(decimals);
  const mintableFlag = typeof isMintable === 'boolean' ? isMintable : String(isMintable).toLowerCase() === 'true';
  const contentValue = typeof content === 'string' ? content : undefined;
  const descriptionValue = typeof description === 'string' ? description : undefined;

  return {
    address,
    symbol,
    name,
    decimals: decimalsNumber,
    isMintable: mintableFlag,
    content: contentValue,
    description: descriptionValue,
  } satisfies Asset;
}

export async function getAssetBalance(
  api: ApiPromise,
  accountAddress: string,
  assetAddress: string,
  assetDecimals = 18
): Promise<AccountBalance> {
  if (assetAddress === XOR.address) {
    const accountInfoCodec = await api.query.system.account(accountAddress);
    const bondedBalance = (await api.query.referrals.referrerBalances(accountAddress)) as Option<u128>;
    const accountInfo = asAccountInfo(accountInfoCodec);

    return formatBalance(accountInfo.data, assetDecimals, bondedBalance);
  }

  const accountDataCodec = await api.query.tokens.accounts(accountAddress, assetAddress);
  const accountData = asBalanceData(accountDataCodec);

  return formatBalance(accountData, assetDecimals);
}

export async function getUsdAssetBalance(
  api: ApiPromise,
  accountAddress: string,
  assetAddress: string,
  assetDecimals = 18,
  priceCoefficient?: string
): Promise<AccountBalance> {
  const balance = await getAssetBalance(api, accountAddress, assetAddress, assetDecimals);
  const price = priceCoefficient ? new FPNumber(priceCoefficient, assetDecimals) : null;

  if (!price) return balance;

  const free = FPNumber.fromCodecValue(balance.free, assetDecimals).mul(price).toCodecString();
  const reserved = FPNumber.fromCodecValue(balance.reserved, assetDecimals).mul(price).toCodecString();
  const frozen = FPNumber.fromCodecValue(balance.frozen, assetDecimals).mul(price).toCodecString();
  const locked = FPNumber.fromCodecValue(balance.locked, assetDecimals).mul(price).toCodecString();
  const total = FPNumber.fromCodecValue(balance.total, assetDecimals).mul(price).toCodecString();
  const transferable = FPNumber.fromCodecValue(balance.transferable, assetDecimals).mul(price).toCodecString();
  const bonded = FPNumber.fromCodecValue(balance.bonded, assetDecimals).mul(price).toCodecString();

  return {
    free,
    reserved,
    frozen,
    locked,
    total,
    transferable,
    bonded,
  };
}

type AssetSubscriptionPayload = {
  asset: AccountAsset;
  balance: AccountBalance;
};

type AssetSubscription = {
  balance: Subscription | null;
  usdBalance: Subscription | null;
};

type TokenAccountSubscription = {
  account: Subscription | null;
  assets: Subscription | null;
  totalBalance: Subscription | null;
};

type PriceSubscription = {
  balanceSubscription?: Observable<string>;
  priceSubscription?: Observable<string>;
};

type PriceServiceLike = {
  getAssetPrice$(priceId: string): Observable<string>;
};

type ApiWithPrices<T> = Api<T> & {
  pricesService?: PriceServiceLike;
};

const toOptionalString = (value?: NumberLike): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value instanceof FPNumber ? value.toString() : String(value);
};

export class AssetSubscriptionEventEmitter {
  private balanceSubject = new Subject<AssetSubscriptionPayload>();
  private usdBalanceSubject = new Subject<AssetSubscriptionPayload>();

  readonly balanceChanges = this.balanceSubject.asObservable();
  readonly usdBalanceChanges = this.usdBalanceSubject.asObservable();

  emitBalanceChange(payload: AssetSubscriptionPayload) {
    this.balanceSubject.next(payload);
  }

  emitUsdBalanceChange(payload: AssetSubscriptionPayload) {
    this.usdBalanceSubject.next(payload);
  }
}

const getAssetsRpc = (api: ApiPromise): AssetsRpcSection => {
  const rpc: unknown = api.rpc;

  assert(hasAssetsRpcSection(rpc), Messages.assetsNotExists);

  return rpc.assets;
};

const getAssetsTxSection = (api: ApiPromise): AssetsTxSection => {
  const tx: unknown = api.tx;

  assert(hasAssetsTxSection(tx), Messages.assetsNotExists);

  return tx.assets;
};

const getLiquidityProxySection = (api: ApiPromise): LiquidityProxyTxSection => {
  const tx: unknown = api.tx;

  assert(hasLiquidityProxyTxSection(tx), Messages.liquidityProxyNotExists);

  return tx.liquidityProxy;
};

const getAssetInfosEntries = (api: ApiPromise): AnyStorageEntry => {
  const query = api.query.assets.assetInfos;

  assert(isStorageEntry(query), Messages.assetsNotExists);

  return query;
};

const getTokenAccountsQuery = (api: ApiPromise): AnyStorageEntry => {
  const query = api.query.tokens.accounts;

  assert(isStorageEntry(query), Messages.assetsNotExists);

  return query;
};

export class AssetsModule<T> {
  private readonly root: ApiWithPrices<T>;
  private readonly eventEmitter = new AssetSubscriptionEventEmitter();
  private readonly subscriptions: Record<string, AssetSubscription> = {};
  private readonly tokenAccountSubscriptions: Record<string, TokenAccountSubscription> = {};
  private readonly balanceSubscriptions = new Map<string, Subscription>();
  private readonly balanceSubject = new Subject<void>();

  readonly balanceUpdated = this.balanceSubject.asObservable();
  readonly accountDefaultAssetsAddresses: string[] = NativeAssets.map((asset) => asset.address);
  public accountAssets: AccountAsset[] = [];
  private _accountAssetsAddresses: string[] = [];

  constructor(root: ApiWithPrices<T>) {
    this.root = root;
  }

  get accountAssetsAddresses(): string[] {
    if (this.root.accountStorage) {
      const stored = this.root.accountStorage.get('assetsAddresses');

      if (stored) {
        try {
          this._accountAssetsAddresses = JSON.parse(stored) as string[];
        } catch (error) {
          console.warn('Assets: failed to parse account assets addresses', error);
          this.root.accountStorage.remove('assetsAddresses');
          this._accountAssetsAddresses = [];
        }
      } else {
        this._accountAssetsAddresses = [];
      }
    }

    return this._accountAssetsAddresses;
  }

  set accountAssetsAddresses(addresses: string[]) {
    this.root.accountStorage?.set('assetsAddresses', JSON.stringify(addresses));
    this._accountAssetsAddresses = [...addresses];
  }

  private getAccountPairOrThrow(): KeyringPair {
    const pair = this.root.accountPair;

    assert(!!pair, Messages.connectWallet);

    return pair;
  }

  private addToAccountAssetsAddressesList(assetAddress: string): void {
    if (this.accountAssetsAddresses.includes(assetAddress)) return;

    this.accountAssetsAddresses = [...this.accountAssetsAddresses, assetAddress];
  }

  private removeFromAccountAssetsAddressesList(assetAddress: string): void {
    this.accountAssetsAddresses = this.accountAssetsAddresses.filter((address) => address !== assetAddress);
  }

  private subscribeToAssetBalanceUpdates(asset: AccountAsset): void {
    const accountPair = this.root.accountPair;

    if (!accountPair) return;

    const assetAddress = asset.address;
    const decimals = asset.decimals;
    const accountAddress = accountPair.address;

    const observable =
      assetAddress === XOR.address
        ? combineLatest([
            this.root.apiRx.query.system.account(accountAddress),
            this.root.apiRx.query.referrals.referrerBalances(accountAddress),
          ]).pipe(
            map(([accountInfo, bonded]) =>
              formatBalance(asAccountInfo(accountInfo).data, decimals, bonded as Option<u128>)
            )
          )
        : this.root.apiRx.query.tokens
            .accounts(accountAddress, assetAddress)
            .pipe(map((data) => formatBalance(asBalanceData(data), decimals)));

    const subscription = observable.subscribe((balance) => {
      asset.balance = balance;
      this.balanceSubject.next();
    });

    this.balanceSubscriptions.get(assetAddress)?.unsubscribe();
    this.balanceSubscriptions.set(assetAddress, subscription);
  }

  private async addToAccountAssetsList(address: string): Promise<void> {
    const existing = this.getAsset(address);

    if (existing) return;

    try {
      const asset = await this.getAccountAsset(address);

      this.accountAssets.push(asset);
      this.subscribeToAssetBalanceUpdates(asset);
      this.balanceSubject.next();
    } catch (error) {
      console.warn('Failed to add account asset', address, error);
    }
  }

  private removeFromAccountAssets(address: string): void {
    const subscription = this.balanceSubscriptions.get(address);

    subscription?.unsubscribe();
    this.balanceSubscriptions.delete(address);

    this.accountAssets = this.accountAssets.filter((asset) => asset.address !== address);
    this.balanceSubject.next();
  }

  private createTransferHistory(
    assetId: string,
    to: string,
    amount: string,
    options?: TransferOptions
  ): HistoryElementTransfer {
    const history: HistoryElementTransfer = {
      type: Operation.Transfer,
      assetAddress: assetId,
      to,
      amount,
    };

    const xorFee = toOptionalString(options?.xorFee);
    const assetFee = toOptionalString(options?.assetFee);

    if (xorFee !== undefined) {
      history.xorFee = xorFee;
    }

    if (assetFee !== undefined) {
      history.assetFee = assetFee;
    }

    if (options?.comment) {
      history.comment = options.comment;
    }

    return history;
  }

  onBalanceChange(callback: (payload: AssetSubscriptionPayload) => void): Subscription {
    return this.eventEmitter.balanceChanges.subscribe(callback);
  }

  onUsdBalanceChange(callback: (payload: AssetSubscriptionPayload) => void): Subscription {
    return this.eventEmitter.usdBalanceChanges.subscribe(callback);
  }

  async getAssetInfo(address: string): Promise<Asset> {
    return getAssetInfo(this.root.api, address);
  }

  async getAssetBalance(address: string, assetAddress: string, decimals = 18): Promise<AccountBalance> {
    return getAssetBalance(this.root.api, address, assetAddress, decimals);
  }

  async getUsdAssetBalance(
    address: string,
    assetAddress: string,
    decimals = 18,
    priceCoefficient?: string
  ): Promise<AccountBalance> {
    return getUsdAssetBalance(this.root.api, address, assetAddress, decimals, priceCoefficient);
  }

  getAsset(address: string): AccountAsset | null {
    return this.accountAssets.find((asset) => asset.address === address) ?? null;
  }

  async getAccountAsset(address: string, accountAddress?: string): Promise<AccountAsset> {
    const targetAddress = accountAddress ?? this.getAccountPairOrThrow().address;
    const assetInfo = await this.getAssetInfo(address);
    const balance = await getAssetBalance(this.root.api, targetAddress, address, assetInfo.decimals);

    return {
      ...assetInfo,
      balance,
    };
  }

  async addAccountAsset(address: string): Promise<void> {
    this.addToAccountAssetsAddressesList(address);
    await this.addToAccountAssetsList(address);
  }

  removeAccountAsset(address: string): void {
    this.removeFromAccountAssetsAddressesList(address);
    this.removeFromAccountAssets(address);
  }

  clearAccountAssets(): void {
    for (const subscription of this.balanceSubscriptions.values()) {
      subscription.unsubscribe();
    }

    this.balanceSubscriptions.clear();
    this.accountAssets = [];
    this.balanceSubject.next();
  }

  getAssets(): Asset[] {
    return [...this.accountAssets];
  }

  async registerAsset(asset: Asset): Promise<T> {
    const { address: assetId, symbol, name, decimals, isMintable, content, description } = asset;
    const assetsTx = getAssetsTxSection(this.root.api);
    const transaction = assetsTx.register(
      symbol,
      name,
      decimals.toString(),
      isMintable ?? false,
      false,
      content ?? null,
      description ?? null
    );

    const accountPair = this.getAccountPairOrThrow();

    return this.root.submitExtrinsic(transaction, accountPair, {
      type: Operation.RegisterAsset,
      assetAddress: assetId,
      symbol,
    });
  }

  async mintAsset(assetId: string, to: string, amount: string): Promise<T> {
    const assetsTx = getAssetsTxSection(this.root.api);
    const transaction = assetsTx.mint(assetId, to, amount);

    const accountPair = this.getAccountPairOrThrow();

    return this.root.submitExtrinsic(transaction, accountPair, {
      type: Operation.Mint,
      assetAddress: assetId,
      to,
      amount,
    });
  }

  mint(asset: Asset | AccountAsset, amount: NumberLike, toAddress?: string): Promise<T> {
    const accountPair = this.getAccountPairOrThrow();
    const targetAddress = toAddress ?? accountPair.address;
    const formattedAddress = targetAddress.startsWith('cn') ? targetAddress : this.root.formatAddress(targetAddress);
    const amountCodec = new FPNumber(amount, asset.decimals ?? FPNumber.DEFAULT_PRECISION).toCodecString();
    const extrinsic = getAssetsTxSection(this.root.api).mint(asset.address, formattedAddress, amountCodec);

    const history: History = {
      type: Operation.Mint,
      to: formattedAddress,
      amount: `${amount}`,
      assetAddress: asset.address,
      symbol: asset.symbol,
    };

    return this.root.submitExtrinsic(extrinsic, accountPair, history);
  }

  async burnAsset(assetId: string, amount: string): Promise<T> {
    const assetsTx = getAssetsTxSection(this.root.api);
    const transaction = assetsTx.burn(assetId, amount);

    const accountPair = this.getAccountPairOrThrow();

    return this.root.submitExtrinsic(transaction, accountPair, {
      type: Operation.Burn,
      assetAddress: assetId,
      amount,
    });
  }

  burn(asset: Asset | AccountAsset, amount: NumberLike): Promise<T> {
    const accountPair = this.getAccountPairOrThrow();
    const amountCodec = new FPNumber(amount, asset.decimals ?? FPNumber.DEFAULT_PRECISION).toCodecString();
    const extrinsic = getAssetsTxSection(this.root.api).burn(asset.address, amountCodec);

    const history: History = {
      type: Operation.Burn,
      amount: `${amount}`,
      assetAddress: asset.address,
      symbol: asset.symbol,
    };

    return this.root.submitExtrinsic(extrinsic, accountPair, history);
  }

  async transfer(assetId: string, to: string, amount: string, options?: TransferOptions): Promise<T> {
    const assetsTx = getAssetsTxSection(this.root.api);
    const extrinsic = assetsTx.transfer(assetId, to, amount);

    const accountPair = this.getAccountPairOrThrow();
    const history = this.createTransferHistory(assetId, to, amount, options);

    return this.root.submitExtrinsic(extrinsic, accountPair, history);
  }

  async xorlessTransfer(
    dexId: number,
    assetAddress: string,
    to: string,
    amount: string,
    desiredXor: NumberLike,
    maxAmountIn: NumberLike,
    selectedSources: unknown[],
    filterMode: FilterMode,
    comment: string | null
  ): Promise<T> {
    const liquidityTx = getLiquidityProxySection(this.root.api);
    const extrinsic = liquidityTx.xorlessTransfer(
      dexId,
      assetAddress,
      to,
      amount,
      desiredXor,
      maxAmountIn,
      selectedSources,
      filterMode,
      comment
    );

    const accountPair = this.getAccountPairOrThrow();

    return this.root.submitExtrinsic(extrinsic, accountPair, {
      type: Operation.XorlessTransfer,
      assetAddress,
      to,
      amount,
      comment: comment ?? undefined,
    });
  }

  subscribeOnAssetTransferableBalance(assetAddress: string, accountAddress: string): Observable<string> {
    return new Observable<string>((subscriber) => {
      let subscription: Subscription | null = null;

      this.getAssetInfo(assetAddress)
        .then((asset) => {
          const decimals = asset.decimals;

          const observable =
            assetAddress === XOR.address
              ? combineLatest([
                  this.root.apiRx.query.system.account(accountAddress),
                  this.root.apiRx.query.referrals.referrerBalances(accountAddress),
                ]).pipe(
                  map(
                    ([account, bonded]) =>
                      formatBalance(asAccountInfo(account).data, decimals, bonded as Option<u128>).transferable
                  )
                )
              : this.root.apiRx.query.tokens
                  .accounts(accountAddress, assetAddress)
                  .pipe(map((data) => formatBalance(asBalanceData(data), decimals).transferable));

          subscription = observable.subscribe({
            next: (value) => subscriber.next(value),
            error: (error) => subscriber.error(error),
          });
        })
        .catch((error) => subscriber.error(error));

      return () => {
        subscription?.unsubscribe();
      };
    });
  }

  subscribeOnAssetBalance(
    asset: AccountAsset,
    assetDecimals: number,
    accountAddress: string,
    priceSubscription?: PriceSubscription
  ) {
    const assetId = asset.address;
    const subscriptionKey = `${assetId}:${accountAddress}`;
    const balanceSubscription = this.root.apiRx.query.tokens
      .accounts(accountAddress, assetId)
      .pipe(map((balanceCodec) => formatBalance(asBalanceData(balanceCodec), assetDecimals)));

    const price$ =
      priceSubscription?.priceSubscription ??
      (asset.priceId && this.root.pricesService ? this.root.pricesService.getAssetPrice$(asset.priceId) : undefined);

    const usdSubscription =
      priceSubscription && price$
        ? combineLatest([priceSubscription.balanceSubscription ?? balanceSubscription, price$]).pipe(
            map(([balanceCodec, price]) =>
              getUsdAssetBalance(this.root.api, accountAddress, assetId, assetDecimals, price).then((_) => _)
            )
          )
        : null;

    const nextBalanceSubscription = balanceSubscription.subscribe((balance) => {
      this.eventEmitter.emitBalanceChange({ asset, balance });
    });

    let nextUsdSubscription: Subscription | null = null;

    if (usdSubscription) {
      nextUsdSubscription = usdSubscription.subscribe(async (balancePromise) => {
        const balance = await balancePromise;

        this.eventEmitter.emitUsdBalanceChange({ asset, balance });
      });
    }

    const existingSubscription = this.subscriptions[subscriptionKey];

    if (existingSubscription) {
      existingSubscription.balance?.unsubscribe();
      existingSubscription.usdBalance?.unsubscribe();
    }

    this.subscriptions[subscriptionKey] = {
      balance: nextBalanceSubscription,
      usdBalance: nextUsdSubscription,
    };
  }

  unsubscribeFromAssetBalance(assetAddress: string, accountAddress: string) {
    const subscriptionKey = `${assetAddress}:${accountAddress}`;
    const subscription = this.subscriptions[subscriptionKey];

    if (!subscription) return;

    subscription.balance?.unsubscribe();
    subscription.usdBalance?.unsubscribe();

    delete this.subscriptions[subscriptionKey];
  }

  async getNextRegisteredAssetId(): Promise<string> {
    const accountPair = this.getAccountPairOrThrow();
    const title = stringToU8a('Sora Asset Id');
    const index = await this.root.api.rpc.system.accountNextIndex(accountPair.address);
    const nonce = bnToU8a(index.toBn().addn(1), { bitLength: 32 });
    const output = keccak256AsU8a(new Uint8Array([...title, ...accountPair.publicKey, ...nonce]));
    output[0] = 0;

    return u8aToHex(output);
  }

  async loadAssetsMetadata() {
    const entries = await getAssetInfosEntries(this.root.api).entries();

    return entries.map((entry) => {
      const [key, value] = entry as unknown as [StorageKeyLike<{ code: AssetIdCodec['code'] }>, unknown];
      const [assetIdCodec] = key.args as StorageKeyLike<{ code: AssetIdCodec['code'] }>['args'];
      const assetId = toAssetId(assetIdCodec as AssetIdCodec);
      const codec = expectAssetInfoCodec(value, Messages.assetsNotExists);
      const [symbol, name, decimals, isMintable] = codec.toHuman() as AssetInfoHuman;
      const decimalsNumber = typeof decimals === 'number' ? decimals : Number(decimals);
      const mintableFlag = typeof isMintable === 'boolean' ? isMintable : String(isMintable).toLowerCase() === 'true';

      return {
        id: assetId,
        symbol,
        name,
        precision: decimalsNumber,
        isMintable: mintableFlag,
      };
    });
  }
}
