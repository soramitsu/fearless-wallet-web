import { map, combineLatest } from 'rxjs';
import { FPNumber } from '@sora/math';

import type { Observable, Signer } from '@polkadot/types/types';
import type { CreateResult } from '@polkadot/ui-keyring/types';
import type { Connection } from '@sora/connection';
import type { CodecString } from '@sora/math';

import { EthBridgeApi } from './eth';
import { EvmBridgeApi } from './evm';
import { SubBridgeApi } from './sub';

import { BridgeNetworkType } from './consts';
import { getEvmNetworkId, getEvmNetworkType } from './methods';
import { PolkadotParachains, KusamaParachains, AlphanetParachains, RococoParachains } from './sub/consts';
import type { Api } from '../api';
import type { Storage } from '../storage';
import type { SupportedApps } from './types';
import type { SubNetwork } from './sub/types';
import type { EvmSupportedApp } from './evm/types';

type CodecLike = {
  toString(): string;
};

type BooleanCodec = {
  isTrue: boolean;
};

type TransferLimitSettingsCodec = {
  maxAmount: CodecLike;
};

type BridgeProxyRpcSection = {
  listApps(): Promise<BridgeAppInfo[]>;
};

type BridgeProxyQuerySection = {
  limitedAssets(asset: string): Promise<BooleanCodec>;
  transferLimitUnlockSchedule: {
    entries(): Promise<Array<[StorageKeyLike<{ toNumber(): number }>, CodecLike]>>;
  };
};

type BridgeProxyRxQuerySection = {
  transferLimit(): Observable<TransferLimitSettingsCodec>;
  consumedTransferLimit(): Observable<CodecLike>;
};

type StorageKeyLike<T> = {
  args: [T, ...unknown[]];
};

type EvmAppInfoCodec = {
  appKind: { toString(): string };
  evmAddress: { toString(): string };
};

type SubNetworkCodec = {
  isRococo: boolean;
  isKusama: boolean;
  isPolkadot: boolean;
  isAlphanet: boolean;
  isMainnet: boolean;
  isCustom: boolean;
  asCustom: { toNumber(): number };
  type: SubNetwork;
};

type SubNetworkIdCodec = {
  asSub: SubNetworkCodec;
};

type BridgeAppInfoEvm = {
  isEvm: true;
  asEvm: [unknown, EvmAppInfoCodec];
};

type BridgeAppInfoSub = {
  isEvm: false;
  asSub: SubNetworkIdCodec;
};

type BridgeAppInfo = BridgeAppInfoEvm | BridgeAppInfoSub;

const isEvmAppInfo = (info: BridgeAppInfo): info is BridgeAppInfoEvm => info.isEvm === true;

const toCodecString = (value: CodecLike): CodecString => value.toString() as CodecString;

const hasBridgeProxySection = <T>(value: unknown): value is { bridgeProxy: T } =>
  typeof value === 'object' && value !== null && 'bridgeProxy' in value;

export class BridgeProxyModule<T> {
  constructor(private readonly root: Api<T>) {}

  public readonly eth = new EthBridgeApi<T>();
  public readonly evm = new EvmBridgeApi<T>();
  public readonly sub = new SubBridgeApi<T>();

  private getBridgeProxyRpc(): BridgeProxyRpcSection {
    const rpc = this.root.api.rpc;

    if (!hasBridgeProxySection<BridgeProxyRpcSection>(rpc)) {
      throw new Error('Bridge proxy RPC section is not available');
    }

    return rpc.bridgeProxy;
  }

  private getBridgeProxyQuery(): BridgeProxyQuerySection {
    const query = this.root.api.query;

    if (!hasBridgeProxySection<BridgeProxyQuerySection>(query)) {
      throw new Error('Bridge proxy query section is not available');
    }

    return query.bridgeProxy;
  }

  private getBridgeProxyRxQuery(): BridgeProxyRxQuerySection {
    const query = this.root.apiRx.query;

    if (!hasBridgeProxySection<BridgeProxyRxQuerySection>(query)) {
      throw new Error('Bridge proxy rx query section is not available');
    }

    return query.bridgeProxy;
  }

  public setConnection(connection: Connection) {
    this.eth.setConnection(connection);
    this.evm.setConnection(connection);
    this.sub.setConnection(connection);
  }

  public initAccountStorage() {
    this.eth.initAccountStorage();
    this.evm.initAccountStorage();
    this.sub.initAccountStorage();
  }

  public setStorage(storage: Storage): void {
    this.eth.setStorage(storage);
    this.evm.setStorage(storage);
    this.sub.setStorage(storage);
  }

  public setSigner(signer: Signer): void {
    this.eth.setSigner(signer);
    this.evm.setSigner(signer);
    this.sub.setSigner(signer);
  }

  public setAccount(account: CreateResult): void {
    this.eth.setAccount(account);
    this.evm.setAccount(account);
    this.sub.setAccount(account);
  }

  public logout(): void {
    this.eth.logout();
    this.evm.logout();
    this.sub.logout();
  }

  // prettier-ignore
  public async getListApps(): Promise<SupportedApps> { // NOSONAR
    const apps: SupportedApps = {
      [BridgeNetworkType.Eth]: {},
      [BridgeNetworkType.Evm]: {},
      [BridgeNetworkType.Sub]: [],
    };

    const data = await this.getBridgeProxyRpc().listApps();

    for (const appInfo of data) {
      if (isEvmAppInfo(appInfo)) {
        const [genericNetworkId, evmAppInfo] = appInfo.asEvm;
        const id = getEvmNetworkId(genericNetworkId);
        const type = getEvmNetworkType(genericNetworkId);
        const kind = evmAppInfo.appKind.toString();
        const address = evmAppInfo.evmAddress.toString();

        if (!apps[type][id]) apps[type][id] = {};

        apps[type][id] = {
          ...apps[type][id],
          [kind]: address,
        } as Partial<EvmSupportedApp>;
      } else {
        const genericNetworkId = appInfo.asSub;
        const type = BridgeNetworkType.Sub;
        const subNetwork = genericNetworkId.asSub;

        // adding parachains we work through relaychain
        if (subNetwork.isRococo) {
          apps[type].push(...RococoParachains);
        } else if (subNetwork.isKusama) {
          apps[type].push(...KusamaParachains);
        } else if (subNetwork.isPolkadot) {
          apps[type].push(...PolkadotParachains);
        } else if (subNetwork.isAlphanet) {
          apps[type].push(...AlphanetParachains);
        } else if (subNetwork.isMainnet) {
          // SORA-SORA bridge is not exists
          console.info(`"Mainnet" sub network is not supported app`);
          continue;
        } else if (subNetwork.isCustom) {
          // Custom bridge is not supported yet
          console.info(`"${subNetwork.asCustom.toNumber()}" sub network is not supported app`);
          continue;
        }

        apps[type].push(subNetwork.type as SubNetwork);
      }
    }

    return apps;
  }

  public async isAssetTransferLimited(assetAddress: string): Promise<boolean> {
    const result = await this.getBridgeProxyQuery().limitedAssets(assetAddress);

    return result.isTrue;
  }

  public getTransferLimitObservable(): Observable<CodecString> {
    return this.getBridgeProxyRxQuery()
      .transferLimit()
      .pipe(map((limitSettings) => toCodecString(limitSettings.maxAmount)));
  }

  public getConsumedTransferLimitObservable(): Observable<CodecString> {
    return this.getBridgeProxyRxQuery()
      .consumedTransferLimit()
      .pipe(map((limit) => toCodecString(limit)));
  }

  public getCurrentTransferLimitObservable(): Observable<CodecString> {
    return combineLatest([this.getTransferLimitObservable(), this.getConsumedTransferLimitObservable()]).pipe(
      map(([maxLimit, consumedLimit]) => {
        const max = FPNumber.fromCodecValue(maxLimit);
        const consumed = FPNumber.fromCodecValue(consumedLimit);
        const current = max.sub(consumed);
        const checked = FPNumber.isGreaterThan(current, FPNumber.ZERO) ? current : FPNumber.ZERO;

        return checked.toCodecString();
      })
    );
  }

  public async getTransferLimitUnlockSchedule(): Promise<{ blockNumber: number; amount: CodecString }[]> {
    const data = await this.getBridgeProxyQuery().transferLimitUnlockSchedule.entries();
    const unlocks = data
      .map(([key, value]) => {
        const blockNumber = key.args[0].toNumber();
        const amount = toCodecString(value);

        return { blockNumber, amount };
      })
      .sort((a, b) => a.blockNumber - b.blockNumber);

    return unlocks;
  }
}
