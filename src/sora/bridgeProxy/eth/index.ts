import first from 'lodash/fp/first';
import { assert } from '@polkadot/util';
import { map, combineLatest } from 'rxjs';
import { FPNumber } from '@sora/math';
import type { Observable } from 'rxjs';

import { ApiAccount, isEthOperation } from '../../apiAccount';
import { Operation } from '../../types';
import { Messages } from '../../logger';
import { getLockedAssets } from '../methods';
import { BridgeNetworkType, BridgeTxStatus } from '../consts';
import { EthNetwork } from './consts';
import { assertRequest, formatRequest, formatApprovedRequest } from './methods';
import type { EthAssetKind } from './consts';
import type { EthAsset, EthApprovedRequest, EthRequest, EthHistory } from './types';
import type { EvmNetwork } from '../evm/types';
import type { Asset } from '../../assets/types';
import type { OptionLike } from '@sora-types';
import type { BridgeTypesGenericNetworkId } from '../methods';

type EthBridgeRequestsOffchainRequest = unknown;

type ResultLike<T> = {
  isOk: boolean;
  asOk: T;
  asErr: { toString(): string };
};

type RegisteredAssetExternal = OptionLike<[CodecLike, NumberCodec]>;

type CodecLike = {
  toString(): string;
};

type NumberCodec = {
  toNumber(): number;
};

type RegisteredAssetEntry = [CodecLike, [CodecLike, unknown], RegisteredAssetExternal];

type ApprovedRequestTuple = Parameters<typeof formatApprovedRequest>;

type ApprovedRequestsResult = ResultLike<ApprovedRequestTuple[]>;

type RegisteredAssetsResult = ResultLike<RegisteredAssetEntry[]>;

type EthBridgeRpcSection = {
  getRegisteredAssets(network: EthNetwork): Promise<RegisteredAssetsResult>;
  getApprovedRequests(hashes: [string], network: EthNetwork): Promise<ApprovedRequestsResult>;
};

type EthBridgeQuerySection = {
  requestStatuses(network: EthNetwork, hash: string): Promise<OptionStatusCodec>;
  loadToIncomingRequestHash(network: EthNetwork, hash: string): Promise<CodecLike>;
  requestSubmissionHeight(network: EthNetwork, hash: string): Promise<NumberCodec>;
  registeredAsset(network: EthNetwork, asset: string): Promise<OptionLike<CodecLike>>;
};

type EthBridgeRxQuerySection = {
  requestStatuses(network: EthNetwork, hash: string): Observable<OptionStatusCodec>;
  requests(network: EthNetwork, hash: string): Observable<OptionLike<EthBridgeRequestsOffchainRequest>>;
};

type OptionStatusCodec = {
  isSome?: boolean;
  isNone?: boolean;
  unwrap(): { toString(): string };
  toString(): string;
};

const isFunction = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === 'function';

const isEthBridgeRpcSection = (value: unknown): value is EthBridgeRpcSection =>
  typeof value === 'object' &&
  value !== null &&
  isFunction((value as EthBridgeRpcSection).getRegisteredAssets) &&
  isFunction((value as EthBridgeRpcSection).getApprovedRequests);

const hasEthBridgeRpcSection = (value: unknown): value is { ethBridge: EthBridgeRpcSection } => {
  if (typeof value !== 'object' || value === null || !('ethBridge' in value)) return false;

  const { ethBridge } = value as { ethBridge?: unknown };

  return isEthBridgeRpcSection(ethBridge);
};

const isEthBridgeQuerySection = (value: unknown): value is EthBridgeQuerySection =>
  typeof value === 'object' &&
  value !== null &&
  isFunction((value as EthBridgeQuerySection).requestStatuses) &&
  isFunction((value as EthBridgeQuerySection).loadToIncomingRequestHash) &&
  isFunction((value as EthBridgeQuerySection).requestSubmissionHeight) &&
  isFunction((value as EthBridgeQuerySection).registeredAsset);

const hasEthBridgeQuerySection = (value: unknown): value is { ethBridge: EthBridgeQuerySection } => {
  if (typeof value !== 'object' || value === null || !('ethBridge' in value)) return false;

  const { ethBridge } = value as { ethBridge?: unknown };

  return isEthBridgeQuerySection(ethBridge);
};

const isEthBridgeRxQuerySection = (value: unknown): value is EthBridgeRxQuerySection =>
  typeof value === 'object' &&
  value !== null &&
  isFunction((value as EthBridgeRxQuerySection).requestStatuses) &&
  isFunction((value as EthBridgeRxQuerySection).requests);

const hasEthBridgeRxQuerySection = (value: unknown): value is { ethBridge: EthBridgeRxQuerySection } => {
  if (typeof value !== 'object' || value === null || !('ethBridge' in value)) return false;

  const { ethBridge } = value as { ethBridge?: unknown };

  return isEthBridgeRxQuerySection(ethBridge);
};

const ETH_BRIDGE_RPC_UNAVAILABLE = 'Ethereum bridge RPC section is not available on this network';
const ETH_BRIDGE_QUERY_UNAVAILABLE = 'Ethereum bridge query section is not available on this network';
const ETH_BRIDGE_RX_QUERY_UNAVAILABLE = 'Ethereum bridge reactive query section is not available on this network';

export class EthBridgeApi<T> extends ApiAccount<T> {
  private externalNetwork: EthNetwork = EthNetwork.Ethereum;

  constructor() {
    super('ethBridgeHistory');
  }

  private get ethBridgeRpc(): EthBridgeRpcSection {
    const rpc: unknown = this.api.rpc;

    assert(hasEthBridgeRpcSection(rpc), ETH_BRIDGE_RPC_UNAVAILABLE);

    return rpc.ethBridge;
  }

  private get ethBridgeQuery(): EthBridgeQuerySection {
    const query: unknown = this.api.query;

    assert(hasEthBridgeQuerySection(query), ETH_BRIDGE_QUERY_UNAVAILABLE);

    return query.ethBridge;
  }

  private get ethBridgeRxQuery(): EthBridgeRxQuerySection {
    const query: unknown = this.apiRx.query;

    assert(hasEthBridgeRxQuerySection(query), ETH_BRIDGE_RX_QUERY_UNAVAILABLE);

    return query.ethBridge;
  }

  public prepareNetworkParam(_evmNetwork: EvmNetwork): BridgeTypesGenericNetworkId {
    const genericNetworkId = this.api.createType('BridgeTypesGenericNetworkId', {
      [BridgeNetworkType.Eth]: this.externalNetwork,
    }) as BridgeTypesGenericNetworkId;

    return genericNetworkId;
  }

  public override initAccountStorage(): void {
    super.initAccountStorage();
    // 1.18 migration
    // "bridgeHistory" -> "ethBridgeHistory"
    // "bridgeHistorySyncTimestamp" -> "ethBridgeHistorySyncTimestamp"
    this.accountStorage?.remove('bridgeHistory');
    this.accountStorage?.remove('bridgeHistorySyncTimestamp');
  }

  public generateHistoryItem(params: EthHistory): EthHistory | null {
    if (!params.type) {
      return null;
    }
    const historyItem = (params || {}) as EthHistory;
    historyItem.startTime = historyItem.startTime || Date.now();
    historyItem.id = this.encrypt(`${historyItem.startTime}`);
    historyItem.transactionState = historyItem.transactionState || 'INITIAL';
    this.saveHistory(historyItem);
    return historyItem;
  }

  public override saveHistory(history: EthHistory): void {
    if (!(history?.id && isEthOperation(history.type))) {
      return;
    }
    super.saveHistory(history);
  }

  protected getTransferExtrinsic(asset: Asset, recipient: string, amount: string | number) {
    const value = new FPNumber(amount, asset.decimals).toCodecString();

    return this.api.tx.ethBridge.transferToSidechain(asset.address, recipient, value, this.externalNetwork);
  }

  /**
   * Transfer through the bridge operation
   * @param asset Asset
   * @param recipient Ethereum account address
   * @param amount
   * @param historyId not required
   */
  public transfer(asset: Asset, recipient: string, amount: string | number, historyId?: string): Promise<T> {
    assert(this.account, Messages.connectWallet);

    const extrinsic = this.getTransferExtrinsic(asset, recipient, amount);
    const historyParam = historyId ? this.getHistory(historyId) : undefined;
    const historyItem = historyParam || {
      symbol: asset.symbol,
      assetAddress: asset.address,
      amount: `${amount}`,
      type: Operation.EthBridgeOutgoing,
    };

    return this.submitExtrinsic(extrinsic, this.account.pair, historyItem);
  }

  /**
   * Get registered assets for bridge
   * @returns Array with all registered assets
   */
  public async getRegisteredAssets(): Promise<Record<string, EthAsset>> {
    const data = await this.ethBridgeRpc.getRegisteredAssets(this.externalNetwork);

    if (!data.isOk) {
      // Returns an empty list and logs issue
      console.warn('[api.bridge.getRegisteredAssets]:', data.asErr?.toString());
      return {};
    }

    return data.asOk.reduce<Record<string, EthAsset>>((buffer, [kind, soraAsset, externalAsset]) => {
      const assetKind = kind.toString() as EthAssetKind;
      const soraAssetId = soraAsset[0].toString();

      let externalAddress = '';
      let externalDecimals: number | undefined = undefined;

      if (externalAsset.isSome) {
        const [externalAssetId, externalAssetDecimals] = externalAsset.unwrap();
        externalAddress = externalAssetId.toString();
        externalDecimals = externalAssetDecimals.toNumber();
      }

      buffer[soraAssetId] = {
        address: externalAddress,
        decimals: externalDecimals,
        assetKind,
      };

      return buffer;
    }, {});
  }

  /**
   * Get approved request
   * @param hash Bridge hash
   * @returns Approved request with proofs
   */
  public async getApprovedRequest(hash: string): Promise<EthApprovedRequest | undefined> {
    const data = await this.ethBridgeRpc.getApprovedRequests([hash], this.externalNetwork);

    assertRequest(data, 'api.bridge.getApprovedRequest');

    const entries = (data.asOk ?? []) as ApprovedRequestTuple[];

    return first(entries.map(([request, proofs]) => formatApprovedRequest(request, proofs)));
  }

  /**
   * Returns bridge request status
   * @param hash sora or evm transaction hash
   * @returns BridgeRequest status
   */
  public async getRequestStatus(hash: string): Promise<BridgeTxStatus | null> {
    const status = await this.ethBridgeQuery.requestStatuses(this.externalNetwork, hash);

    const statusFlags = status as { isSome?: boolean; isNone?: boolean };
    if (statusFlags?.isNone || statusFlags?.isSome === false) {
      return null;
    }

    const value = typeof status.unwrap === 'function' ? status.unwrap().toString() : status.toString();

    return (value as BridgeTxStatus) ?? null;
  }

  /**
   * Creates a subscription to bridge request status
   * @param hash sora or evm transaction hash
   * @returns BridgeRequest status
   */
  public subscribeOnRequestStatus(hash: string): Observable<BridgeTxStatus | null> {
    return this.ethBridgeRxQuery.requestStatuses(this.externalNetwork, hash).pipe(
      map((data) => {
        const isNone = data?.isNone ?? data?.isSome === false;
        if (isNone) return null;

        const value = typeof data.unwrap === 'function' ? data.unwrap().toString() : data?.toString();

        return (value as BridgeTxStatus) ?? null;
      })
    );
  }

  /**
   * Creates a subscription to bridge request data
   * @param hash sora or evm transaction hash
   * @returns BridgeRequest not formatted body
   */
  private subscribeOnRequestData(hash: string): Observable<EthBridgeRequestsOffchainRequest | null> {
    return this.ethBridgeRxQuery
      .requests(this.externalNetwork, hash)
      .pipe(map((data) => (data.isSome ? data.unwrap() : null)));
  }

  /**
   * Creates a subscription to bridge request
   * @param hash sora or evm transaction hash
   * @returns BridgeRequest if request is registered
   */
  public subscribeOnRequest(hash: string): Observable<EthRequest | null> {
    const data = this.subscribeOnRequestData(hash);
    const status = this.subscribeOnRequestStatus(hash);

    return combineLatest([data, status]).pipe(
      map(([data, status]) => {
        return !!data && !!status ? formatRequest(data, status) : null;
      })
    );
  }

  public async getSoraHashByEthereumHash(ethereumHash: string): Promise<string> {
    return (await this.ethBridgeQuery.loadToIncomingRequestHash(this.externalNetwork, ethereumHash)).toString();
  }

  public async getSoraBlockHashByRequestHash(requestHash: string): Promise<string> {
    const soraBlockNumber = (
      await this.ethBridgeQuery.requestSubmissionHeight(this.externalNetwork, requestHash)
    ).toNumber();

    const soraBlockHash = (await this.api.rpc.chain.getBlockHash(soraBlockNumber)).toString();

    return soraBlockHash;
  }

  public async getAssetKind(assetAddress: string): Promise<EthAssetKind | null> {
    const data = await this.ethBridgeQuery.registeredAsset(this.externalNetwork, assetAddress);

    if (!data.isSome) return null;

    const kind = data.unwrap();

    return kind.toString() as EthAssetKind;
  }

  public async getLockedAssets(evmNetwork: EvmNetwork, assetAddress: string) {
    return await getLockedAssets(this.api, this.prepareNetworkParam(evmNetwork), assetAddress);
  }
}
