import { ApiPromise, WsProvider } from '@polkadot/api';
import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { FPNumber } from './number';
import { amount, codec, slippageFactor, text, unwrap, XOR, VAL, type Runtime } from './runtime';
export { amount, codec, observe, slippageFactor, text, unwrap, XOR, VAL, type Runtime } from './runtime';
import { Operation, type Asset, type AccountAsset, type NetworkFeesObject } from './types';
import { SoraPools } from './pools';
import { SoraStaking } from './staking';
import { SoraSubmissionUnknownError } from './submission';
import schema from './schema/types.json';
import type { ApiInterfaceEvents } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import { isDefiniteSubstratePoolRejection } from '@/util/substratePoolRejection';

export class SoraClient {
  api: Runtime = null;
  provider: WsProvider | null = null;
  account: { json: unknown; pair: KeyringPair } | null = null;
  shouldPairBeLocked = false;
  private feeRequestRevision = 0;
  NetworkFee: NetworkFeesObject = Object.fromEntries(Object.values(Operation).map((key) => [key, '0']));
  dex = { baseAssetsIds: [] as string[], ids: new Map<string, number>() };
  poolXyk = new SoraPools(this);
  demeterFarming = this.poolXyk.farming;
  ceresLiquidityLocker = this.poolXyk.locker;
  staking = new SoraStaking(this);
  get connected(): boolean { return Boolean(this.api?.isConnected); }
  formatAddress(address: string): string { return encodeAddress(decodeAddress(address), 69); }
  get address(): string {
    if (!this.account?.pair) throw new Error('Select a SORA account');
    return this.formatAddress(this.account.pair.address);
  }
  async initialize(_withAccount = false): Promise<void> {
    await this.api.isReadyOrError;
    const entries = await this.api.query.dexManager.dexInfos.entries();
    const ids = new Map<string, number>();
    for (const [key, value] of entries) {
      const info = unwrap(value);
      if (!info || info.isPublic === false || info.isPublic?.isFalse === true) continue;
      const base = text(info.baseAssetId);
      const id = Number(key.args[0]);
      if (!/^0x[\da-f]{64}$/i.test(base) || !Number.isSafeInteger(id) || id < 0) throw new Error('Invalid DEX registry');
      if (!ids.has(base) || id < ids.get(base)!) ids.set(base, id);
    }
    this.dex.ids = ids;
    this.dex.baseAssetsIds = [...ids.keys()];
  }
  async fee(extrinsic: Runtime): Promise<string> {
    const address = this.account?.pair?.address ?? encodeAddress(new Uint8Array(32), 69);
    return codec((await extrinsic.paymentInfo(address)).partialFee);
  }
  async submit(extrinsic: Runtime, expectedPair = this.account?.pair): Promise<void> {
    if (!expectedPair || expectedPair !== this.account?.pair || expectedPair.isLocked) throw new Error('SORA signer changed or is locked');
    if (!this.connected) throw new Error('SORA is disconnected');
    if (extrinsic.registry !== this.api.registry) throw new Error('SORA runtime changed; review the transaction again');
    // No mnemonic export, account enumeration, or HTTP request is involved in signing.
    await new Promise<void>((resolve, reject) => {
      let unsubscribe: (() => void) | undefined;
      let settled = false;
      let receivedStatus = false;
      let wasInBlock = false;
      let transactionHash: string | undefined;
      const captureHash = (value: Runtime) => {
        try {
          const hash = value?.toHex?.() ?? value?.toString?.();
          if (typeof hash === 'string' && /^0x[a-f\d]{64}$/i.test(hash)) transactionHash = hash;
        } catch { /* Missing diagnostics must not change the send's outcome. */ }
      };
      const unknown = () => {
        // Polkadot signs this extrinsic in place. An unsigned hash is not the
        // hash submitted to the chain, so never use it as a fallback.
        if (!transactionHash && extrinsic.isSigned === true) captureHash(extrinsic.hash);
        return new SoraSubmissionUnknownError(transactionHash);
      };
      const stop = (handle?: () => void) => {
        try { handle?.(); } catch { /* Confirmation is already settled. */ }
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stop(unsubscribe);
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => finish(unknown()), 120_000);
      try {
        Promise.resolve(extrinsic.signAndSend(expectedPair, { nonce: -1 }, (result: Runtime) => {
          if (settled) return;
          receivedStatus = true;
          captureHash(result.txHash);
          wasInBlock ||= Boolean(result.status.isInBlock);
          if (result.status.isInvalid && !wasInBlock) return finish(new Error('SORA transaction was rejected'));
          if (result.status.isInvalid || result.status.isDropped || result.status.isUsurped || result.status.isFinalityTimeout) {
            return finish(unknown());
          }
          // Inclusion and dispatch results can be retracted. Only finalization
          // establishes success or an on-chain failure.
          if (!result.status.isFinalized) return;
          if (result.internalError) return finish(unknown());
          if (result.dispatchError) return finish(new Error('SORA transaction failed on chain'));
          if (result.events?.some(({ event }: Runtime) => (event.section === 'system' && event.method === 'ExtrinsicFailed') || (event.section === 'utility' && ['BatchInterrupted', 'ItemFailed'].includes(event.method)))) {
            return finish(new Error('SORA operation failed on chain'));
          }
          finish();
        })).then((handle) => { unsubscribe = handle; if (settled) stop(handle); }, (error: unknown) => {
          // Local signing precedes the RPC, so a signed hash alone does not
          // imply acceptance. Once a status arrived, preserve uncertainty.
          finish(!receivedStatus && isDefiniteSubstratePoolRejection(error)
            ? new Error('SORA transaction was rejected')
            : unknown());
        });
      } catch (error) {
        // A synchronous rejection before signing/status delivery cannot have
        // reached the chain. Once signing started, preserve uncertainty.
        finish(receivedStatus || extrinsic.isSigned === true ? unknown() : error as Error);
      }
    });
  }
  assets = {
    getAssetInfo: async (address: string): Promise<Asset> => {
      if (!/^0x[\da-f]{64}$/i.test(address)) throw new Error('Invalid SORA asset');
      const fields = (await this.api.query.assets.assetInfos(address)).toHuman();
      const [symbol, name, decimals, isMintable] = fields;
      const precision = Number(decimals);
      if (!symbol || !Number.isInteger(precision) || precision < 0 || precision > 255) throw new Error('Unknown SORA asset');
      return { address, symbol: String(symbol), name: String(name), decimals: precision, isMintable: isMintable === true };
    },
    getAccountAsset: async (address: string): Promise<AccountAsset> => {
      const account = this.address;
      const asset = await this.assets.getAssetInfo(address);
      const data = address === XOR ? (await this.api.query.system.account(account)).data : await this.api.query.tokens.accounts(account, address);
      const free = BigInt(codec(data.free));
      const reserved = BigInt(codec(data.reserved));
      const frozen = [data.frozen, data.miscFrozen, data.feeFrozen].reduce((max, item) => { const n = BigInt(codec(item)); return n > max ? n : max; }, 0n);
      const bonded = address === XOR && this.api.query.referrals?.referrerBalances ? BigInt(codec(unwrap(await this.api.query.referrals.referrerBalances(account)))) : 0n;
      const transferable = free > frozen ? free - frozen : 0n;
      return { ...asset, balance: { free: String(free), reserved: String(reserved), frozen: String(frozen), bonded: String(bonded), locked: String(reserved + frozen + bonded), total: String(free + reserved + bonded), transferable: String(transferable) } };
    },
  };
  swap = {
    getMinMaxValue: (a: Asset, b: Asset, amountA: string, amountB: string, output: boolean, tolerance: string | number) => {
      const scale = output ? a.decimals : b.decimals;
      const value = new FPNumber(output ? amountA : amountB, scale);
      const factor = slippageFactor(tolerance);
      return value.mul(output ? FPNumber.ONE.add(factor) : FPNumber.ONE.sub(factor)).toCodecString();
    },
    getResultFromDexRpc: async (a: string, b: string, value: string, output = false, source = '', allow = true, dexId = 0) => {
      const asset = await this.assets.getAssetInfo(output ? b : a);
      if (!this.provider) throw new Error('SORA provider is unavailable');
      const quote = await this.provider.send('liquidityProxy_quote', [dexId, a, b, amount(value, asset.decimals), output ? 'WithDesiredOutput' : 'WithDesiredInput', source ? [source] : [], source ? (allow ? 'AllowSelected' : 'ForbidSelected') : 'Disabled']);
      if (quote === null) return { amount: '0', route: [] as string[] };
      if (!quote || !Array.isArray(quote.route)) throw new Error('Invalid SORA quote');
      return { amount: codec(quote.amount), route: quote.route.map((id: Runtime) => text(id)) as string[] };
    },
    execute: async (a: Asset, b: Asset, amountA: string, amountB: string, tolerance: string | number, output = false, source = '', dexId = 0) => {
      const limit = this.swap.getMinMaxValue(a, b, amountA, amountB, output, tolerance);
      const variant = output ? { WithDesiredOutput: { desiredAmountOut: amount(amountB, b.decimals), maxAmountIn: limit } } : { WithDesiredInput: { desiredAmountIn: amount(amountA, a.decimals), minAmountOut: limit } };
      if (BigInt(limit) <= 0n) throw new Error('Swap limit must be positive');
      await this.submit(this.api.tx.liquidityProxy.swap(dexId, a.address, b.address, variant, source ? [source] : [], source ? 'AllowSelected' : 'Disabled'));
    },
  };
  async calcStaticNetworkFees(): Promise<void> {
    const api = this.api;
    const registry = api.registry;
    const revision = ++this.feeRequestRevision;
    const tx = api.tx;
    const builders: Partial<Record<Operation, () => Runtime>> = {
      [Operation.StakingBondExtra]: () => tx.staking.bondExtra('0'),
      [Operation.StakingRebond]: () => tx.staking.rebond('0'),
      [Operation.StakingUnbond]: () => tx.staking.unbond('0'),
      [Operation.StakingSetController]: () => tx.staking.setController.meta.args.length === 0 ? tx.staking.setController() : tx.staking.setController(this.account?.pair?.address ?? encodeAddress(new Uint8Array(32), 69)),
      [Operation.StakingWithdrawUnbonded]: () => tx.staking.withdrawUnbonded(0),
      [Operation.StakingSetPayee]: () => tx.staking.setPayee('Stash'),
      [Operation.CeresLiquidityLockerLockLiquidity]: () => tx.ceresLiquidityLocker.lockLiquidity(XOR, VAL, 0, '1000000000000000000', false),
      [Operation.Swap]: () => tx.liquidityProxy.swap(0, XOR, VAL, { WithDesiredInput: { desiredAmountIn: '0', minAmountOut: '0' } }, [], 'Disabled'),
      [Operation.AddLiquidity]: () => tx.poolXYK.depositLiquidity(0, XOR, VAL, '0', '0', '0', '0'),
      [Operation.RemoveLiquidity]: () => tx.poolXYK.withdrawLiquidity(0, XOR, VAL, '0', '0', '0'),
      [Operation.DemeterFarmingDepositLiquidity]: () => tx.demeterFarmingPlatform.deposit(XOR, VAL, VAL, true, '0'),
      [Operation.DemeterFarmingWithdrawLiquidity]: () => tx.demeterFarmingPlatform.withdraw(XOR, VAL, VAL, '0', true),
      [Operation.DemeterFarmingStakeToken]: () => tx.demeterFarmingPlatform.deposit(VAL, VAL, VAL, false, '0'),
      [Operation.DemeterFarmingUnstakeToken]: () => tx.demeterFarmingPlatform.withdraw(VAL, VAL, VAL, '0', false),
      [Operation.DemeterFarmingGetRewards]: () => tx.demeterFarmingPlatform.getRewards(XOR, VAL, VAL, true),
    };
    const fees: NetworkFeesObject = {};
    await Promise.all(Object.entries(builders).map(async ([operation, build]) => {
      try { fees[operation] = await this.fee(build()); }
      catch { fees[operation] = '0'; } // Existing action guards reject unknown/zero fees.
    }));
    // Callers consume NetworkFee immediately after awaiting this refresh. A stale
    // request must reject, rather than exposing fees belonging to another request.
    if (this.api !== api || api.registry !== registry || this.feeRequestRevision !== revision) {
      throw new Error('SORA connection, runtime or fee request changed; refresh network fees');
    }
    this.NetworkFee = fees;
  }
}

export type SoraConnectionOptions = { autoConnectMs?: number; eventListeners?: [ApiInterfaceEvents, (...args: Runtime[]) => void][] };

/** Each endpoint owns its API/provider; delayed cleanup never mutates a replacement. */
export function createConnection(endpoint: string, options: SoraConnectionOptions = {}) {
  if (!/^wss?:\/\//.test(endpoint)) throw new Error('Invalid SORA WebSocket endpoint');
  const provider = new WsProvider(endpoint, options.autoConnectMs);
  const connectedApi = new ApiPromise({ provider, types: schema as Runtime, signedExtensions: { ChargeTransactionPayment2: { extrinsic: { charge_fee_info: 'ChargeFeeInfo' }, payload: {} } } });
  for (const [event, callback] of options.eventListeners ?? []) connectedApi.on(event, callback);
  return { api: connectedApi, provider };
}

export const api = new SoraClient();
export const connection = {
  get api() { return api.api as ApiPromise; },
  open(endpoint: string, options: SoraConnectionOptions = {}) {
    const previous = api.api;
    const connected = createConnection(endpoint, options);
    api.provider = connected.provider;
    api.api = connected.api;
    if (previous) void previous.disconnect().catch((error: unknown) => console.warn('Previous SORA connection could not close', error));
  },
};
export type Api<_T = void> = SoraClient;
