import { assert } from '@polkadot/util';
import { map, combineLatest } from 'rxjs';
import { FPNumber, CodecString } from '@sora/math';
import type { Observable, Codec, AnyFunction } from '@polkadot/types/types';
import type { Vec, u128 } from '@polkadot/types-codec';
import type { ITuple } from '@polkadot/types-codec/types';
import type { SubmittableExtrinsic, AugmentedSubmittable } from '@polkadot/api-base/types';

import { RewardingEvents, RewardType } from './consts';
import { toAssetId } from '../assets';
import { VAL, PSWAP } from '../assets/consts';
import { Messages } from '../logger';
import { Operation } from '../types';
import type { Api } from '../api';
import type { RewardInfo, RewardsInfo, RewardTypedEvent } from './types';
import type { Asset } from '../assets/types';
import type { OptionLike } from '@sora-types';

type CrowdloanInfo = {
  totalContribution: FPNumber;
  rewards: Record<string, FPNumber>;
  startBlock: number;
  length: number;
  account: string;
  tag: string;
};

type RewardsEntries = Iterable<[Codec, Codec]> & {
  entries(): IterableIterator<[Codec, Codec]>;
};

type CrowdloanInfoCodec = {
  totalContribution: u128;
  rewards: Vec<ITuple<[Codec, u128]>>;
  startBlock: Codec & { toNumber(): number };
  length: Codec & { toNumber(): number };
  account: { toString(): string };
};

type CrowdloanUserInfoCodec = {
  contribution: u128;
  rewarded: Vec<ITuple<[Codec, u128]>>;
};

type CrowdloanUserReward = {
  contribution: FPNumber;
  rewarded: Record<string, FPNumber>;
};

type RewardsRpcSection = {
  claimables(address: string): Promise<[Codec, Codec, Codec]>;
};

type VestedRewardsData = {
  limit: Codec;
  totalAvailable: Codec;
  rewards: RewardsEntries;
};

const unwrapOption = <T>(value: unknown): T => (value as OptionLike<T>).unwrap();

const optionIsEmpty = (value: unknown): boolean => Boolean((value as OptionLike<unknown>).isEmpty);

const hasInnerCodec = (value: unknown): value is { inner: Codec } =>
  typeof value === 'object' && value !== null && 'inner' in value;

const toNumberInput = (value: Codec | number | string | FPNumber): string | number => {
  if (value instanceof FPNumber) {
    return value.toCodecString();
  }

  if (typeof value === 'object' && value !== null) {
    return (value as Codec).toString();
  }

  return value;
};

const getCrowdloanRewardsMap = (data: Vec<ITuple<[Codec, u128]>>): Record<string, FPNumber> => {
  return data.reduce<Record<string, FPNumber>>((buffer, tuple) => {
    if (!tuple.isEmpty) {
      const [assetId, amount] = tuple;

      const assetAddress = toAssetId(assetId);
      const claimedAmount = new FPNumber(toNumberInput(amount));

      buffer[assetAddress] = (buffer[assetAddress] || FPNumber.ZERO).add(claimedAmount);
    }

    return buffer;
  }, {});
};

export class RewardsModule<T> {
  constructor(private readonly root: Api<T>) {}

  private isClaimableReward(reward: RewardInfo): boolean {
    const fpAmount = FPNumber.fromCodecValue(reward.amount, reward.asset.decimals);

    return !fpAmount.isZero();
  }

  private containsRewardsForType(items: Array<RewardInfo | RewardsInfo>, type: RewardType): boolean {
    return items.some((item) => {
      const key = 'rewards' in item ? item.rewards : [item];

      return key.some((item) => this.isClaimableReward(item) && item.type[0] === type);
    });
  }

  private prepareRewardInfo(
    type: RewardTypedEvent,
    amount: Codec | number | string | FPNumber,
    rewardAsset?: Asset
  ): RewardInfo {
    const asset = rewardAsset ?? PSWAP;
    const fpAmount = new FPNumber(toNumberInput(amount), asset.decimals);
    const rewardInfo = {
      type,
      asset,
      amount: fpAmount.toCodecString(),
    } as RewardInfo;

    return rewardInfo;
  }

  private prepareVestedRewardsInfo(limit: Codec, total: Codec, rewards: RewardsEntries): RewardsInfo {
    const asset = PSWAP;
    // reward table with zero amount for each event
    const buffer = [
      RewardingEvents.BuyOnBondingCurve,
      RewardingEvents.LiquidityProvisionFarming,
      RewardingEvents.MarketMakerVolume,
    ].reduce<Record<string, RewardInfo>>((result, key) => {
      return {
        ...result,
        [key]: this.prepareRewardInfo([RewardType.Strategic, key], 0, asset),
      };
    }, {});

    // update reward table with real values
    for (const [event, balance] of rewards.entries()) {
      const key = event.toString();
      buffer[key] = this.prepareRewardInfo([RewardType.Strategic, key], balance, asset);
    }

    const fpLimit = new FPNumber(toNumberInput(limit), asset.decimals);
    const fpTotal = new FPNumber(toNumberInput(total), asset.decimals);

    return {
      limit: fpLimit.toCodecString(),
      total: fpTotal.toCodecString(),
      rewards: Object.values(buffer),
    };
  }

  /**
   * Check rewards for external account
   * @param externalAddress address of external account (ethereum account address)
   * @returns rewards array with not zero amount
   */
  public async checkForExternalAccount(externalAddress: string): Promise<Array<RewardInfo>> {
    const { rewards: rewardsRpc } = this.root.api.rpc as unknown as { rewards: RewardsRpcSection };
    const [xorErc20Amount, soraFarmHarvestAmount, nftAirdropAmount] = await rewardsRpc.claimables(externalAddress);

    const rewardEntries = [
      this.prepareRewardInfo([RewardType.External, RewardingEvents.SoraFarmHarvest], soraFarmHarvestAmount, PSWAP),
      this.prepareRewardInfo([RewardType.External, RewardingEvents.NftAirdrop], nftAirdropAmount, PSWAP),
      this.prepareRewardInfo([RewardType.External, RewardingEvents.XorErc20], xorErc20Amount, VAL),
    ].filter((item) => this.isClaimableReward(item));

    return rewardEntries;
  }

  /**
   * Get observable reward for liqudity provision
   * @returns observable liquidity provision RewardInfo
   */
  public getLiquidityProvisionRewardsSubscription(): Observable<RewardInfo> {
    assert(this.root.account, Messages.connectWallet);

    return this.root.apiRx.query.pswapDistribution.shareholderAccounts(this.root.account.pair.address).pipe(
      map((balance) =>
        /* FixnumFixedPoint.inner: CodecString */
        this.prepareRewardInfo(
          [RewardType.Provision, RewardingEvents.LiquidityProvision],
          new FPNumber(toNumberInput(hasInnerCodec(balance) ? balance.inner : balance), PSWAP.decimals),
          PSWAP
        )
      )
    );
  }

  public getVestedRewardsSubscription(): Observable<RewardsInfo> {
    assert(this.root.account, Messages.connectWallet);

    return this.root.apiRx.query.vestedRewards.rewards(this.root.account.pair.address).pipe(
      map((data) => {
        const typedData = data as unknown as VestedRewardsData;

        return this.prepareVestedRewardsInfo(typedData.limit, typedData.totalAvailable, typedData.rewards);
      })
    );
  }

  /**
   * Get all crowdloans infos
   */
  public async getCrowdloans(): Promise<CrowdloanInfo[]> {
    const data = await this.root.api.query.vestedRewards.crowdloanInfos.entries();

    return data.reduce<CrowdloanInfo[]>((buffer, [key, info]) => {
      if (!optionIsEmpty(info)) {
        const crowdloanData = unwrapOption<CrowdloanInfoCodec>(info);

        buffer.push({
          totalContribution: new FPNumber(toNumberInput(crowdloanData.totalContribution)),
          rewards: getCrowdloanRewardsMap(crowdloanData.rewards),
          startBlock: crowdloanData.startBlock.toNumber(),
          length: crowdloanData.length.toNumber(),
          account: crowdloanData.account.toString(),
          tag: new TextDecoder().decode((key.args[0] as Codec).toU8a()),
        });
      }

      return buffer;
    }, []);
  }

  /**
   * Get observable map of rewards user already claimed
   */
  public getCrowdloanUserInfoObservable(
    tag: string
  ): Observable<{ contribution: FPNumber; rewarded: Record<string, FPNumber> }> {
    assert(this.root.account, Messages.connectWallet);

    return this.root.apiRx.query.vestedRewards.crowdloanUserInfos(this.root.account.pair.address, tag).pipe(
      map((result) => {
        if (optionIsEmpty(result))
          return {
            contribution: FPNumber.ZERO,
            rewarded: {},
          };

        const data = unwrapOption<CrowdloanUserInfoCodec>(result);
        const contribution = new FPNumber(toNumberInput(data.contribution));
        const rewarded = getCrowdloanRewardsMap(data.rewarded);

        return {
          contribution,
          rewarded,
        };
      })
    );
  }

  /**
   * Get observable crowdloan rewards
   */
  public async getCrowdloanRewardsSubscription(): Promise<Observable<Record<string, RewardInfo[]>>> {
    assert(this.root.account, Messages.connectWallet);

    const blocksPerDay = 14_400;

    const crowdloans = await this.getCrowdloans();

    const assetsIds = [...new Set(crowdloans.map(({ rewards }) => Object.keys(rewards)).flat(1))];
    const assets = await Promise.all(assetsIds.map((assetId) => this.root.assets.getAssetInfo(assetId)));
    const assetsMap = assets.reduce<Record<string, Asset>>(
      (buffer, asset) => ({ ...buffer, [asset.address]: asset }),
      {}
    );

    const userCrowdloansObservable = crowdloans.map((crowdloan) => this.getCrowdloanUserInfoObservable(crowdloan.tag));
    const currentBlockObservable = this.root.system.getBlockNumberObservable();

    return combineLatest([currentBlockObservable, ...userCrowdloansObservable]).pipe(
      map(([currentBlockRaw, ...userCrowdloans]) => {
        const currentBlock = Number(currentBlockRaw);
        const crowdloanUserData = userCrowdloans as CrowdloanUserReward[];

        return crowdloans.reduce<Record<string, RewardInfo[]>>((buffer, crowdloan, index) => {
          const endBlock = crowdloan.startBlock + crowdloan.length;
          const elapsedBlocks = Math.max(Math.min(endBlock, currentBlock) - crowdloan.startBlock, 0);
          const userCrowdloan = crowdloanUserData[index];
          const userContributionPart = crowdloan.totalContribution.isZero()
            ? FPNumber.ZERO
            : userCrowdloan.contribution.div(crowdloan.totalContribution);

          const lenghtDays = Math.floor(crowdloan.length / blocksPerDay);
          const elapsedDays = Math.floor(elapsedBlocks / blocksPerDay);
          const elapsedPart = FPNumber.fromNatural(elapsedDays).div(FPNumber.fromNatural(lenghtDays));

          const rewards = Object.entries(crowdloan.rewards).map(([assetId, assetTotalAmount]) => {
            const asset = { ...assetsMap[assetId] };
            const totalAmount = assetTotalAmount.mul(userContributionPart);
            const currentAmount = totalAmount.mul(elapsedPart);
            const rewardedAmount = userCrowdloan.rewarded[assetId] ?? FPNumber.ZERO;
            const claimableAmount = FPNumber.isGreaterThanOrEqualTo(currentAmount, rewardedAmount)
              ? currentAmount.sub(rewardedAmount)
              : FPNumber.ZERO;

            const rewardInfo = this.prepareRewardInfo([RewardType.Crowdloan, crowdloan.tag], claimableAmount, asset);

            return {
              ...rewardInfo,
              total: totalAmount.sub(rewardedAmount).toCodecString(),
            };
          });

          buffer[crowdloan.tag] = rewards;

          return buffer;
        }, {});
      })
    );
  }

  /**
   * Returns a params object { tx, type }
   * @param rewards claiming rewards
   * @param signature message signed in external wallet (if want to claim external rewards), otherwise empty string
   */
  private calcTxParams(
    rewards: Array<RewardInfo | RewardsInfo>,
    signature = ''
  ): { tx: SubmittableExtrinsic<'promise'>; type: AugmentedSubmittable<AnyFunction> } {
    const transactions: { tx: SubmittableExtrinsic<'promise'>; type: AugmentedSubmittable<AnyFunction> }[] = [];

    // liquidity provision
    if (this.containsRewardsForType(rewards, RewardType.Provision)) {
      transactions.push({
        tx: this.root.api.tx.pswapDistribution.claimIncentive(),
        type: this.root.api.tx.pswapDistribution.claimIncentive,
      });
    }

    // vested
    if (this.containsRewardsForType(rewards, RewardType.Strategic)) {
      transactions.push({
        tx: this.root.api.tx.vestedRewards.claimRewards(),
        type: this.root.api.tx.vestedRewards.claimRewards,
      });
    }

    // external
    if (this.containsRewardsForType(rewards, RewardType.External)) {
      transactions.push({
        tx: this.root.api.tx.rewards.claim(signature),
        type: this.root.api.tx.rewards.claim,
      });
    }

    // crowdloan
    const crowdloanTags = rewards
      .map((reward) => {
        const items = 'rewards' in reward ? reward.rewards : [reward];
        const tags = items.reduce<string[]>((buffer, item) => {
          const [rewardType, rewardEvent] = item.type;

          if (rewardType === RewardType.Crowdloan) {
            buffer.push(rewardEvent);
          }
          return buffer;
        }, []);

        return tags;
      })
      .flat(1);

    const uniqueTags = [...new Set(crowdloanTags)];

    for (const tag of uniqueTags) {
      transactions.push({
        tx: this.root.api.tx.vestedRewards.claimCrowdloanRewards(tag),
        type: this.root.api.tx.vestedRewards.claimCrowdloanRewards,
      });
    }

    // batch or simple tx
    if (transactions.length > 1)
      return {
        tx: this.root.api.tx.utility.batchAll(transactions.map(({ tx }) => tx)),
        type: this.root.api.tx.utility.batchAll,
      };

    if (transactions.length === 1) return transactions[0];

    // for current compability
    return {
      tx: this.root.api.tx.rewards.claim(signature),
      type: this.root.api.tx.rewards.claim,
    };
  }

  /**
   * Get network fee for claim rewards operation
   */
  public async getNetworkFee(rewards: Array<RewardInfo>, signature = ''): Promise<CodecString> {
    const { tx, type } = this.calcTxParams(rewards, signature);

    switch (type) {
      case this.root.api.tx.pswapDistribution.claimIncentive:
        return this.root.NetworkFee[Operation.ClaimLiquidityProvisionRewards];
      case this.root.api.tx.vestedRewards.claimRewards:
        return this.root.NetworkFee[Operation.ClaimVestedRewards];
      case this.root.api.tx.vestedRewards.claimCrowdloanRewards:
        return this.root.NetworkFee[Operation.ClaimCrowdloanRewards];
      case this.root.api.tx.rewards.claim:
        return this.root.NetworkFee[Operation.ClaimExternalRewards];
      default: {
        return await this.root.getTransactionFee(tx);
      }
    }
  }

  /**
   * Claim rewards
   * @param signature message signed in external wallet (if want to claim external rewards)
   */
  public claim(
    rewards: Array<RewardInfo | RewardsInfo>,
    signature?: string,
    fee?: CodecString,
    externalAddress?: string
  ): Promise<T> {
    assert(this.root.account, Messages.connectWallet);

    const { tx } = this.calcTxParams(rewards, signature);

    const historyItem = {
      type: Operation.ClaimRewards,
      externalAddress,
      soraNetworkFee: fee,
      rewards,
    };

    return this.root.submitExtrinsic(tx, this.root.account.pair, historyItem);
  }
}
