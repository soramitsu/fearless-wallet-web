import type { FPNumber } from './number';
export type { CodecString } from './number';

export type Asset = { address: string; symbol: string; name: string; decimals: number; isMintable: boolean; content?: string; description?: string };
export type AccountBalance = { free: string; reserved: string; frozen: string; bonded: string; locked: string; total: string; transferable: string };
export type AccountAsset = Asset & { balance: AccountBalance };
export type AccountLiquidity = {
  address: string; balance: string; symbol?: string; name?: string; decimals?: number; decimals2?: number;
  firstAddress: string; secondAddress: string; firstBalance: string; secondBalance: string;
  poolShare: string; reserveA: string; reserveB: string; totalSupply: string;
};
export type DemeterPool = {
  baseAsset: string; poolAsset: string; rewardAsset: string; multiplier: number; isCore: boolean; isFarm: boolean;
  isRemoved: boolean; depositFee: number; totalTokensInPool: FPNumber; rewards: FPNumber; rewardsToBeDistributed: FPNumber;
};
export type DemeterAccountPool = { isFarm: boolean; baseAsset: string; poolAsset: string; pooledTokens: FPNumber; rewardAsset: string; rewards: FPNumber };
export type AccountLockedPool = { poolTokens: FPNumber; unlockingTimestamp: number; assetA: string; assetB: string };
export enum DexId { XOR = 0, XSTUSD = 1, KSUD = 2 }
export enum LiquiditySourceTypes { Default = '', XYKPool = 'XYKPool', MulticollateralBondingCurvePool = 'MulticollateralBondingCurvePool', XSTPool = 'XSTPool', OrderBook = 'OrderBook' }
export enum SubNetworkId { Mainnet = 'Mainnet', Polkadot = 'Polkadot', Kusama = 'Kusama', Rococo = 'Rococo', PolkadotAstar = 'PolkadotAstar', PolkadotAcala = 'PolkadotAcala', Liberland = 'Liberland' }
export type SubNetwork = SubNetworkId;
export enum LiberlandAssetType { LLD = 'LLD', Asset = 'Asset' }
export enum BridgeAccountType { Sora = 'Sora', Liberland = 'Liberland', Parachain = 'Parachain', Evm = 'EVM' }
export enum Operation {
  StakingBondExtra = 'StakingBondExtra', StakingRebond = 'StakingRebond', StakingUnbond = 'StakingUnbond',
  StakingSetController = 'StakingSetController', StakingWithdrawUnbonded = 'StakingWithdrawUnbonded', StakingSetPayee = 'StakingSetPayee',
  Swap = 'Swap', AddLiquidity = 'AddLiquidity', RemoveLiquidity = 'RemoveLiquidity',
  DemeterFarmingDepositLiquidity = 'DemeterFarmingDepositLiquidity', DemeterFarmingWithdrawLiquidity = 'DemeterFarmingWithdrawLiquidity',
  DemeterFarmingStakeToken = 'DemeterFarmingStakeToken', DemeterFarmingUnstakeToken = 'DemeterFarmingUnstakeToken',
  DemeterFarmingGetRewards = 'DemeterFarmingGetRewards', CeresLiquidityLockerLockLiquidity = 'CeresLiquidityLockerLockLiquidity',
}
export type NetworkFeesObject = Record<string, string>;
export type Unlocking = { value: string; remainingEras: string; remainingHours: string; remainingDays: string };
export type MyStakingInfo = { myValidators: string[]; payee: string; controller: string; redeemAmount: string; activeStake: string; totalStake: string; unbond: { unlocking: Unlocking[]; sum: string } };
export type Payouts = { era: string; validators: string[] }[];
export type NominatorReward = { era: string; sumRewards: string; validators: { address: string; value: string }[] }[];
export type ValidatorExposure = { total: string; own: string; others: { who: string; value: string }[] };
export type ValidatorInfoFull = {
  address: string; commission: string; blocked?: boolean; rewardPoints: number;
  nominators: { who: string; value: string }[]; identity: { info: Record<string, string> } | null;
  apy: string; isOversubscribed: boolean; isKnownGood: boolean; stake: { total: string; own: string };
};
export type DemeterRewardToken = { assetId: string; tokenPerBlock: FPNumber; farmsTotalMultiplier: number; stakingTotalMultiplier: number; farmsAllocation: FPNumber; stakingAllocation: FPNumber; teamAllocation: FPNumber };
