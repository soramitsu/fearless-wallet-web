import { FPNumber } from './number';
import { VAL, XOR } from './runtime';
import type { Runtime, SoraClient } from './client';
import type { MyStakingInfo, NominatorReward, Payouts, ValidatorExposure, ValidatorInfoFull } from './types';

type Exposure = ValidatorExposure & { address: string };
type Page = Exposure & { page: number; pageTotal: string };
type BondRequest = { value: string; controller: string; payee: string; validators: string[] };
type PayoutRequest = { payouts: Payouts; payee?: string };
const BILLION = 1_000_000_000n;
const raw = (value: Runtime): bigint => {
  const encoded = String(value ?? 0);
  if (!/^\d+$/.test(encoded)) throw new Error('Invalid unsigned staking value');
  return BigInt(encoded);
};
const opt = (value: Runtime): Runtime => (value?.unwrapOr ? value.unwrapOr(null) : value);
const human = (value: Runtime): string => FPNumber.fromCodecValue(raw(value)).toString();
const positive = (value: string): string => {
  const number = new FPNumber(value);
  if (!number.isFinity() || !number.gt(0)) throw new Error('Stake amount must be positive');
  const encoded = number.toCodecString();
  if (BigInt(encoded) === 0n) throw new Error('Stake amount is below the asset precision');
  return encoded;
};
const integer = (value: Runtime): number => {
  const result = Number(raw(value));
  if (!Number.isSafeInteger(result)) throw new Error('Staking index exceeds the supported range');
  return result;
};
// Match Substrate Perbill: rational construction floors; multiplication rounds
// to nearest with exact ties rounded down (sp-arithmetic/per_things.rs).
const perbill = (value: bigint, parts: bigint): bigint => (value * parts + (BILLION / 2n - 1n)) / BILLION;
const share = (value: bigint, numerator: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) return 0n;
  return perbill(value, numerator >= denominator ? BILLION : (numerator * BILLION) / denominator);
};

/** Metadata-driven staking, with no key export or external SDK execution. */
export class SoraStaking {
  private nominationLimit = 0;
  constructor(private readonly client: SoraClient) {}
  private get api(): Runtime {
    return this.client.api;
  }
  private address(value: Runtime): string {
    return this.client.formatAddress(String(value));
  }
  private destination(value: string): Runtime {
    return ['Staked', 'Stash', 'Controller', 'None'].includes(value) ? value : { Account: this.address(value) };
  }
  private batch(calls: Runtime[]): Runtime {
    if (!calls.length) throw new Error('No claimable staking operations');
    return calls.length === 1 ? calls[0] : this.api.tx.utility.batchAll(calls);
  }
  private nominations(validators: string[]): string[] {
    const addresses = [...new Set(validators.map((value) => this.address(value)))];
    if (!addresses.length || addresses.length > this.getMaxNominations())
      throw new Error('Invalid number of validators');
    return addresses;
  }
  private eraMilliseconds(): number {
    const constants = this.api.consts;
    const blockTime = integer(constants.babe?.expectedBlockTime ?? raw(constants.timestamp.minimumPeriod) * 2n);
    const blocks = integer(constants.babe?.epochDuration ?? constants.session.period);
    const duration = blockTime * blocks * integer(constants.staking.sessionsPerEra);
    if (!Number.isSafeInteger(duration) || duration <= 0) throw new Error('Staking era duration is unavailable');
    return duration;
  }
  private async loadNominationLimit(): Promise<void> {
    const expectedApi = this.api;
    const constant = expectedApi.consts.staking.maxNominations;
    // Recent staking runtimes expose NominationsQuota through the runtime API.
    const limit =
      constant ?? (await expectedApi.call.stakingApi.nominationsQuota('340282366920938463463374607431768211455'));
    if (this.api !== expectedApi) throw new Error('SORA connection changed; refresh staking parameters');
    this.nominationLimit = integer(limit);
    if (!this.nominationLimit) throw new Error('Staking nomination limit is unavailable');
  }
  getMaxNominations(): number {
    const limit = integer(this.api.consts.staking.maxNominations ?? this.nominationLimit);
    if (!limit) throw new Error('Refresh staking parameters before nominating');
    return limit;
  }
  getMaxNominatorRewardedPerValidator(): number {
    // Paged exposures pay every nominator; a page size is not a reward cutoff.
    return this.api.query.staking.erasStakersPaged
      ? 0
      : integer(this.api.consts.staking.maxNominatorRewardedPerValidator);
  }
  getUnbondPeriod(): number {
    return (integer(this.api.consts.staking.bondingDuration) * this.eraMilliseconds()) / 86_400_000;
  }
  async getMinNominatorBond(): Promise<number> {
    return Number(human(await this.api.query.staking.minNominatorBond()));
  }
  async getCurrentEra(): Promise<string> {
    const active = opt(await this.api.query.staking.activeEra());
    return String(active?.index ?? opt(await this.api.query.staking.currentEra()) ?? 0);
  }
  async getStashByController(address: string): Promise<string> {
    const ledger = opt(await this.api.query.staking.ledger(this.address(address)));
    return ledger ? this.address(ledger.stash) : '';
  }
  async getNominations(address: string): Promise<{ targets: string[]; submittedIn: number } | null> {
    const nominations = opt(await this.api.query.staking.nominators(this.address(address)));
    return nominations
      ? {
          targets: [...nominations.targets].map((id) => this.address(id)),
          submittedIn: integer(nominations.submittedIn),
        }
      : null;
  }
  async getMyStakingInfo(address: string): Promise<MyStakingInfo> {
    const stash = this.address(address);
    const [bonded, destination, nominations, era] = await Promise.all([
      this.api.query.staking.bonded(stash),
      this.api.query.staking.payee(stash),
      this.getNominations(stash),
      this.getCurrentEra(),
    ]);
    const controller = opt(bonded);
    const ledger = opt(await this.api.query.staking.ledger(controller ?? stash));
    let redeem = 0n;
    let pending = 0n;
    const unlocking: MyStakingInfo['unbond']['unlocking'] = [];
    for (const chunk of ledger?.unlocking ?? []) {
      const value = raw(chunk.value);
      const remaining = Math.max(0, integer(chunk.era) - integer(era));
      if (!remaining) {
        redeem += value;
        continue;
      }
      pending += value;
      const hours = (remaining * this.eraMilliseconds()) / 3_600_000;
      unlocking.push({
        value: human(value),
        remainingEras: String(remaining),
        remainingHours: String(hours),
        remainingDays: String(Math.ceil(hours / 24)),
      });
    }
    const payee = destination.isAccount ? this.address(destination.asAccount) : String(destination.type ?? destination);
    return {
      myValidators: nominations?.targets ?? [],
      payee,
      controller: controller ? this.address(controller) : ledger ? stash : '',
      redeemAmount: human(redeem),
      activeStake: human(ledger?.active),
      totalStake: human(ledger?.total),
      unbond: { unlocking, sum: human(pending) },
    };
  }

  private async pages(era: string): Promise<Page[]> {
    const staking = this.api.query.staking;
    if (!staking.erasStakersPaged) {
      const entries = await staking.erasStakersClipped.entries(era);
      return entries.map(([key, exposure]: Runtime) => ({
        address: this.address(key.args[1]),
        total: String(raw(exposure.total)),
        own: String(raw(exposure.own)),
        others: [...exposure.others].map(({ who, value }: Runtime) => ({
          who: this.address(who),
          value: String(raw(value)),
        })),
        page: 0,
        pageTotal: String(raw(exposure.total)),
      }));
    }
    const [overviews, pageEntries, legacyEntries] = await Promise.all([
      staking.erasStakersOverview.entries(era),
      staking.erasStakersPaged.entries(era),
      staking.erasStakersClipped ? staking.erasStakersClipped.entries(era) : [],
    ]);
    const metadata = new Map<string, Runtime>(
      overviews.map(([key, value]: Runtime) => [this.address(key.args[1]), opt(value)])
    );
    const result: Page[] = [];
    for (const [key, optional] of pageEntries) {
      const page = opt(optional);
      if (!page) continue;
      const address = this.address(key.args[1]);
      const overview = metadata.get(address);
      if (!overview) throw new Error('Staking exposure overview is missing');
      const index = integer(key.args[2]);
      const own = index === 0 ? raw(overview.own) : 0n;
      result.push({
        address,
        page: index,
        total: String(raw(overview.total)),
        own: String(own),
        pageTotal: String(raw(page.pageTotal) + own),
        others: [...page.others].map(({ who, value }: Runtime) => ({
          who: this.address(who),
          value: String(raw(value)),
        })),
      });
    }
    // Validators without nominators still have an own-stake reward on page 0.
    for (const [address, overview] of metadata) {
      if (overview && !result.some((page) => page.address === address))
        result.push({
          address,
          page: 0,
          total: String(raw(overview.total)),
          own: String(raw(overview.own)),
          pageTotal: String(raw(overview.own)),
          others: [],
        });
    }
    // Paged runtimes retain clipped exposures for earlier eras during migration.
    for (const [key, exposure] of legacyEntries) {
      const address = this.address(key.args[1]);
      if (metadata.get(address)) continue;
      result.push({
        address,
        page: 0,
        total: String(raw(exposure.total)),
        own: String(raw(exposure.own)),
        pageTotal: String(raw(exposure.total)),
        others: [...exposure.others].map(({ who, value }: Runtime) => ({
          who: this.address(who),
          value: String(raw(value)),
        })),
      });
    }
    return result;
  }
  async getElectedValidators(era: string): Promise<Exposure[]> {
    if (!this.api.query.staking.erasStakersPaged && this.api.query.staking.erasStakers) {
      return (await this.api.query.staking.erasStakers.entries(era)).map(([key, exposure]: Runtime) => ({
        address: this.address(key.args[1]),
        total: String(raw(exposure.total)),
        own: String(raw(exposure.own)),
        others: [...exposure.others].map(({ who, value }: Runtime) => ({
          who: this.address(who),
          value: String(raw(value)),
        })),
      }));
    }
    const result = new Map<string, Exposure>();
    for (const page of await this.pages(era)) {
      const existing = result.get(page.address);
      if (existing) {
        existing.own = String(raw(existing.own) + raw(page.own));
        existing.others.push(...page.others);
      } else
        result.set(page.address, { address: page.address, total: page.total, own: page.own, others: [...page.others] });
    }
    return [...result.values()];
  }
  async getValidatorsInfo(): Promise<ValidatorInfoFull[]> {
    const expectedApi = this.api;
    const expectedRegistry = expectedApi.registry;
    await this.loadNominationLimit();
    const era = await this.getCurrentEra();
    const prior = String(Math.max(0, integer(era) - 1));
    const [entries, elected, rewards, points, rewardQuote] = await Promise.all([
      this.api.query.staking.validators.entries(),
      this.getElectedValidators(era),
      this.api.query.staking.erasValidatorReward(prior),
      this.api.query.staking.erasRewardPoints(prior),
      this.client.swap.getResultFromDexRpc(VAL, XOR, '1').catch(() => null),
    ]);
    // Rewards are denominated in VAL while the bonded stake is XOR. Use the
    // current quote for one VAL before comparing their values (both use 18 decimals).
    let rewardToStakeRatio = FPNumber.ZERO;
    try {
      const ratio = FPNumber.fromCodecValue(raw(rewardQuote?.amount));
      if (ratio.isFinity() && ratio.gt(0)) rewardToStakeRatio = ratio;
    } catch { /* An unavailable price must not prevent unbonding, redemption or reward claims. */ }
    const exposures = new Map(elected.map((entry) => [entry.address, entry]));
    const pointMap = new Map<string, bigint>(
      [...points.individual.entries()].map(([who, value]: Runtime) => [this.address(who), raw(value)])
    );
    const eraReward = raw(opt(rewards));
    const max = this.getMaxNominatorRewardedPerValidator();
    const validators: ValidatorInfoFull[] = [];
    // Bound identity requests; an unhealthy RPC cannot queue all validators at once.
    for (let offset = 0; offset < entries.length; offset += 16) {
      validators.push(
        ...(await Promise.all(
          entries.slice(offset, offset + 16).map(async ([key, prefs]: Runtime): Promise<ValidatorInfoFull> => {
            const address = this.address(key.args[0]);
            const exposure = exposures.get(address) ?? { total: '0', own: '0', others: [] };
            const identityData = this.api.derive.accounts?.info
              ? (await this.api.derive.accounts.info(address)).identity
              : null;
            const info: Record<string, string> = {};
            for (const field of ['display', 'legal', 'twitter', 'web'])
              if (identityData?.[field]) info[field] = String(identityData[field]);
            const valPoints = pointMap.get(address) ?? 0n;
            const gross = share(eraReward, valPoints, raw(points.total));
            const net = gross - perbill(gross, raw(prefs.commission));
            const apy =
              raw(exposure.total) > 0n
                ? new FPNumber(net)
                    .div(exposure.total)
                    .mul(rewardToStakeRatio)
                    .mul(31_536_000_000 / this.eraMilliseconds())
                    .mul(100)
                    .toString()
                : '0';
            return {
              address,
              commission: new FPNumber(raw(prefs.commission)).div(10_000_000).toString(),
              blocked: Boolean(prefs.blocked?.isTrue ?? prefs.blocked),
              rewardPoints: Number(valPoints),
              nominators: exposure.others.sort((a, b) =>
                raw(a.value) > raw(b.value) ? -1 : raw(a.value) < raw(b.value) ? 1 : 0
              ),
              identity: Object.keys(info).length ? { info } : null,
              apy,
              isOversubscribed: max > 0 && exposure.others.length >= max,
              isKnownGood: (identityData?.judgements ?? []).some(
                ([, judgement]: Runtime) => judgement.isKnownGood || judgement.isReasonable
              ),
              stake: { total: exposure.total, own: exposure.own },
            };
          })
        ))
      );
    }
    if (this.api !== expectedApi || this.api.registry !== expectedRegistry)
      throw new Error('SORA connection changed; refresh validator estimates');
    return validators;
  }

  private async claimed(era: string, validator: string): Promise<Set<number>> {
    const staking = this.api.query.staking;
    const controller = opt(await staking.bonded(validator));
    const ledger = opt(await staking.ledger(controller ?? validator));
    const oldClaims = ledger?.legacyClaimedRewards ?? ledger?.claimedRewards ?? [];
    if ([...oldClaims].some((claimed) => String(claimed) === era)) return new Set([-1]);
    return staking.claimedRewards
      ? new Set<number>([...(await staking.claimedRewards(era, validator))].map(integer))
      : new Set();
  }
  async getNominatorsReward(address: string): Promise<NominatorReward> {
    const stash = this.address(address);
    const active = integer(await this.getCurrentEra());
    const depth = integer(this.api.consts.staking.historyDepth ?? (await this.api.query.staking.historyDepth()));
    const results: NominatorReward = [];
    // Query only completed eras and release each era's exposure data immediately.
    for (let eraNumber = Math.max(0, active - depth); eraNumber < active; eraNumber++) {
      const era = String(eraNumber);
      const reward = raw(opt(await this.api.query.staking.erasValidatorReward(era)));
      if (!reward) continue;
      const [pages, points] = await Promise.all([this.pages(era), this.api.query.staking.erasRewardPoints(era)]);
      const pointMap = new Map<string, bigint>(
        [...points.individual.entries()].map(([who, value]: Runtime) => [this.address(who), raw(value)])
      );
      const validators = new Map<string, bigint>();
      const claims = new Map<string, Set<number>>();
      const preferences = new Map<string, Runtime>();
      for (const page of pages) {
        const nominator = page.others.find(({ who }) => who === stash);
        if (page.address !== stash && !nominator) continue;
        if (!claims.has(page.address)) claims.set(page.address, await this.claimed(era, page.address));
        const paid = claims.get(page.address)!;
        if (paid.has(-1) || paid.has(page.page)) continue;
        if (!preferences.has(page.address))
          preferences.set(page.address, await this.api.query.staking.erasValidatorPrefs(era, page.address));
        const gross = share(reward, pointMap.get(page.address) ?? 0n, raw(points.total));
        const commission = perbill(gross, raw(preferences.get(page.address).commission));
        const stake = page.address === stash ? raw(page.own) : raw(nominator?.value);
        let value = share(gross - commission, stake, raw(page.total));
        if (page.address === stash) value += share(commission, raw(page.pageTotal), raw(page.total));
        if (value > 0n) validators.set(page.address, (validators.get(page.address) ?? 0n) + value);
      }
      if (validators.size)
        results.push({
          era,
          sumRewards: human([...validators.values()].reduce((sum, value) => sum + value, 0n)),
          validators: [...validators].map(([address, value]) => ({ address, value: human(value) })),
        });
    }
    return results;
  }

  private bondCall(request: BondRequest): Runtime {
    const bond = this.api.tx.staking.bond;
    const value = positive(request.value);
    const destination = this.destination(request.payee);
    const controller = this.address(request.controller);
    if (bond.meta.args.length === 2) {
      if (controller !== this.client.address) throw new Error('This runtime uses the stash as its controller');
      return bond(value, destination);
    }
    if (bond.meta.args.length !== 3) throw new Error('Unsupported staking bond call');
    return bond(controller, value, destination);
  }
  private bondAndNominateCall(request: BondRequest): Runtime {
    return this.batch([this.bondCall(request), this.api.tx.staking.nominate(this.nominations(request.validators))]);
  }
  async getBondAndNominateNetworkFee(request: BondRequest): Promise<string> {
    await this.loadNominationLimit();
    return this.client.fee(this.bondAndNominateCall(request));
  }
  async bondAndNominate(request: BondRequest): Promise<void> {
    const pair = this.client.account?.pair;
    await this.loadNominationLimit();
    await this.client.submit(this.bondAndNominateCall(request), pair);
  }
  async getNominateNetworkFee({ validators }: { validators: string[] }): Promise<string> {
    await this.loadNominationLimit();
    return this.client.fee(this.api.tx.staking.nominate(this.nominations(validators)));
  }
  async nominate({ validators }: { validators: string[] }): Promise<void> {
    const pair = this.client.account?.pair;
    await this.loadNominationLimit();
    await this.client.submit(this.api.tx.staking.nominate(this.nominations(validators)), pair);
  }
  async bondExtra({ value }: { value: string }): Promise<void> {
    await this.client.submit(this.api.tx.staking.bondExtra(positive(value)));
  }
  async unbond({ value }: { value: string }): Promise<void> {
    await this.client.submit(this.api.tx.staking.unbond(positive(value)));
  }
  async rebond({ value }: { value: string }): Promise<void> {
    await this.client.submit(this.api.tx.staking.rebond(positive(value)));
  }
  async setPayee({ payee }: { payee: string }): Promise<void> {
    await this.client.submit(this.api.tx.staking.setPayee(this.destination(payee)));
  }
  async setController({ address }: { address: string }): Promise<void> {
    const set = this.api.tx.staking.setController;
    if (set.meta.args.length === 0) {
      if (this.address(address) !== this.client.address)
        throw new Error('This runtime only permits migration to the stash controller');
      await this.client.submit(set());
    } else await this.client.submit(set(this.address(address)));
  }
  async withdrawUnbonded(_request: { value: string }): Promise<void> {
    const expectedApi = this.api;
    const pair = this.client.account?.pair;
    const account = this.client.address;
    const stash = (await this.getStashByController(account)) || account;
    const spans = opt(await this.api.query.staking.slashingSpans(stash));
    const count = spans ? [...spans.prior].length + 1 : 0;
    if (this.api !== expectedApi) throw new Error('SORA connection changed; refresh staking parameters');
    await this.client.submit(this.api.tx.staking.withdrawUnbonded(count), pair);
  }
  private async payoutCall({ payouts, payee }: PayoutRequest): Promise<Runtime> {
    const expectedApi = this.api;
    const calls: Runtime[] = [];
    if (payee !== undefined) calls.push(this.api.tx.staking.setPayee(this.destination(payee)));
    const seen = new Set<string>();
    for (const item of payouts) {
      const era = String(integer(item.era));
      for (const input of item.validators) {
        const validator = this.address(input);
        const id = `${era}:${validator}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const claimed = await this.claimed(era, validator);
        if (claimed.has(-1)) continue;
        if (this.api.tx.staking.payoutStakersByPage && this.api.query.staking.erasStakersOverview) {
          const overview = opt(await this.api.query.staking.erasStakersOverview(era, validator));
          const count = overview ? Math.max(1, integer(overview.pageCount)) : 1;
          for (let page = 0; page < count; page++)
            if (!claimed.has(page)) calls.push(this.api.tx.staking.payoutStakersByPage(validator, era, page));
        } else if (!claimed.has(0)) calls.push(this.api.tx.staking.payoutStakers(validator, era));
      }
    }
    if (calls.length === (payee === undefined ? 0 : 1)) throw new Error('No claimable staking rewards');
    if (this.api !== expectedApi) throw new Error('SORA connection changed; refresh staking parameters');
    return this.batch(calls);
  }
  async getPayoutNetworkFee(request: PayoutRequest): Promise<string> {
    return this.client.fee(await this.payoutCall(request));
  }
  async payout(request: PayoutRequest): Promise<void> {
    const pair = this.client.account?.pair;
    const transaction = await this.payoutCall(request);
    await this.client.submit(transaction, pair);
  }
}
