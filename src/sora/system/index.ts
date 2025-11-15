import { map, Subject } from 'rxjs';
import { FPNumber } from '@sora/math';
import type { Observable } from '@polkadot/types/types';
import type { GenericExtrinsic } from '@polkadot/types';
import type { AnyTuple } from '@polkadot/types-codec/types';
import type { u32, u128 } from '@polkadot/types-codec';

import type { Api } from '../api';
import type { OptionLike, VecLike } from '@sora-types';

type FrameSystemEventRecord = unknown;
type EventRecords = VecLike<FrameSystemEventRecord>;
type RuntimeUpgradeInfo = {
  specVersion?: {
    toNumber: () => number;
  };
};

export class SystemModule<T> {
  constructor(private readonly root: Api<T>) {}

  private subject = new Subject<number>();
  public updated = this.subject.asObservable();

  get specVersion(): number {
    const version = this.root.api.consts.system.version as unknown as { specVersion: u32 };

    return version.specVersion.toNumber();
  }

  public getChainDecimals(api = this.root.api): number {
    return api.registry.chainDecimals[0];
  }

  public getBlockNumberObservable(apiRx = this.root.apiRx): Observable<number> {
    return apiRx.query.system.number().pipe(
      map((codec) => {
        const blockNumber = (codec as u32).toNumber();

        this.subject.next(blockNumber);

        return blockNumber;
      })
    );
  }

  public getBlockHashObservable(blockNumber: number, apiRx = this.root.apiRx): Observable<string> {
    return apiRx.query.system.blockHash(blockNumber).pipe(map((hash) => hash.toString()));
  }

  public async getRuntimeVersion(api = this.root.api): Promise<number | null> {
    const data = await api.query.system.lastRuntimeUpgrade();
    const systemInfo = (data as unknown as OptionLike<RuntimeUpgradeInfo>).unwrapOr(null);
    return systemInfo?.specVersion?.toNumber?.() ?? null;
  }

  public getRuntimeVersionObservable(apiRx = this.root.apiRx): Observable<number | null> {
    return apiRx.query.system.lastRuntimeUpgrade().pipe(
      map((data) => {
        const systemInfo = (data as unknown as OptionLike<RuntimeUpgradeInfo>).unwrapOr(null);
        return systemInfo?.specVersion?.toNumber?.() ?? null;
      })
    );
  }

  public getEventsObservable(apiRx = this.root.apiRx): Observable<EventRecords> {
    return apiRx.query.system.events() as unknown as Observable<EventRecords>;
  }

  public async getBlockHash(blockNumber: number, api = this.root.api): Promise<string> {
    return (await api.rpc.chain.getBlockHash(blockNumber)).toString();
  }

  public async getBlockNumber(blockHash: string, api = this.root.api): Promise<number> {
    const apiInstanceAtBlock = await api.at(blockHash);
    const blockNumber = (await apiInstanceAtBlock.query.system.number()) as unknown as u32;

    return blockNumber.toNumber();
  }

  public async getBlockTimestamp(blockHash: string, api = this.root.api): Promise<number> {
    const apiInstanceAtBlock = await api.at(blockHash);
    const timestamp = (await apiInstanceAtBlock.query.timestamp.now()) as unknown as u128;

    return timestamp.toNumber();
  }

  public async getCurrentTimestamp(api = this.root.api): Promise<number> {
    const timestamp = (await api.query.timestamp.now()) as unknown as u128;

    return timestamp.toNumber();
  }

  public async getExtrinsicsFromBlock(
    blockId: string,
    api = this.root.api
  ): Promise<Array<GenericExtrinsic<AnyTuple>>> {
    const signedBlock = await api.rpc.chain.getBlock(blockId);
    return signedBlock.block?.extrinsics.toArray() ?? [];
  }

  public async getBlockEvents(blockId: string, api = this.root.api): Promise<Array<FrameSystemEventRecord>> {
    const apiInstanceAtBlock = await api.at(blockId);
    const events = (await apiInstanceAtBlock.query.system.events()) as unknown as EventRecords;

    return events.toArray();
  }

  /** NetworkFeeMultiplier is for the SORA network only */
  public async getNetworkFeeMultiplier(api = this.root.api): Promise<number> {
    const u128Data = (await api.query.xorFee.multiplier()) as unknown as u128;
    return new FPNumber(u128Data).toNumber();
  }

  /** NetworkFeeMultiplier is for the SORA network only */
  public getNetworkFeeMultiplierObservable(apiRx = this.root.apiRx): Observable<number> {
    return apiRx.query.xorFee
      .multiplier()
      .pipe(map((u128Data) => new FPNumber(u128Data as unknown as u128).toNumber()));
  }
}
