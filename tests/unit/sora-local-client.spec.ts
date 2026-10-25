import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoraSubmissionUnknownError, soraSubmissionUnknownResponse } from '@/sora/submission';
import { SoraClient, amount, observe, XOR, VAL, type Runtime } from '@/sora/client';
import { SubNetworkId, type Asset } from '@/sora/types';
import { poolMarkerForAmount, poolWithdrawal } from '@/sora/pools';

const asset = (address: string, decimals = 18): Asset => ({ address, decimals, symbol: 'TEST', name: 'Test', isMintable: false });
function fixture() {
  const client = new SoraClient();
  const pair = { address: '5GrwvaEF5zXb26Fz9rcQpDWS64pdDujn2AUVFQZh3aTw6rVqY', isLocked: false } as Runtime;
  client.account = { json: null, pair };
  client.api = { isConnected: true, tx: { liquidityProxy: { swap: vi.fn(() => ({})) }, poolXYK: { depositLiquidity: vi.fn(() => ({})), withdrawLiquidity: vi.fn(() => ({})) }, bridgeProxy: { burn: vi.fn(() => ({})) } } };
  client.dex.ids.set(XOR, 0);
  return { client, pair };
}
describe('wallet-owned SORA transaction encoding', () => {
  it('unwraps optional DEX entries and excludes private DEXes', async () => {
    const { client } = fixture();
    client.api.query = { dexManager: { dexInfos: { entries: async () => [
      [{ args: [0] }, { unwrapOr: () => ({ baseAssetId: { code: XOR }, isPublic: { isFalse: false } }) }],
      [{ args: [5] }, { unwrapOr: () => ({ baseAssetId: { code: VAL }, isPublic: { isFalse: true } }) }],
      [{ args: [2] }, { unwrapOr: () => null }],
    ] } } };
    await client.initialize();
    expect(client.dex.baseAssetsIds).toEqual([XOR]);
    expect(client.dex.ids.get(XOR)).toBe(0);
  });
  it('treats an absent optional referral balance as zero', async () => {
    const { client } = fixture();
    vi.spyOn(client, 'formatAddress').mockReturnValue('public-account');
    vi.spyOn(client.assets, 'getAssetInfo').mockResolvedValue(asset(XOR));
    client.api.query = {
      system: { account: async () => ({ data: { free: '100', reserved: '3', frozen: '20' } }) },
      referrals: { referrerBalances: async () => ({ toString: () => '', unwrapOr: (fallback: unknown) => fallback }) },
    };
    expect((await client.assets.getAccountAsset(XOR)).balance).toEqual({ free: '100', reserved: '3', frozen: '20', bonded: '0', locked: '23', total: '103', transferable: '80' });
  });
  it('preserves the static staking fees consumed by recovery forms', async () => {
    const { client } = fixture();
    const builder = () => ({});
    const setController = Object.assign(builder, { meta: { args: [] } });
    client.api.tx.staking = { bondExtra: builder, rebond: builder, unbond: builder, setController, withdrawUnbonded: builder, setPayee: builder };
    vi.spyOn(client, 'fee').mockResolvedValue('123');
    await client.calcStaticNetworkFees();
    for (const key of ['StakingBondExtra', 'StakingRebond', 'StakingUnbond', 'StakingSetController', 'StakingWithdrawUnbonded', 'StakingSetPayee']) {
      expect(client.NetworkFee[key]).toBe('123');
    }
  });
  it('encodes both swap directions with exact scales and limits', async () => {
    const { client } = fixture();
    vi.spyOn(client, 'submit').mockResolvedValue();
    await client.swap.execute(asset(XOR, 18), asset(VAL, 6), '1.5', '2', '0.5');
    expect(client.api.tx.liquidityProxy.swap).toHaveBeenCalledWith(0, XOR, VAL, { WithDesiredInput: { desiredAmountIn: '1500000000000000000', minAmountOut: '1990000' } }, [], 'Disabled');
    await client.swap.execute(asset(XOR, 18), asset(VAL, 6), '1.5', '2', '0.5', true, 'XYKPool', 1);
    expect(client.api.tx.liquidityProxy.swap).toHaveBeenLastCalledWith(1, XOR, VAL, { WithDesiredOutput: { desiredAmountOut: '2000000', maxAmountIn: '1507500000000000000' } }, ['XYKPool'], 'AllowSelected');
  });
  it('encodes pool additions and removals in canonical base order', async () => {
    const { client } = fixture();
    vi.spyOn(client, 'submit').mockResolvedValue();
    await client.poolXyk.add(asset(VAL, 6), asset(XOR), '2', '1', '1');
    expect(client.api.tx.poolXYK.depositLiquidity).toHaveBeenCalledWith(0, XOR, VAL, '1000000000000000000', '2000000', '990000000000000000', '1980000');
    await client.poolXyk.remove(asset(XOR), asset(VAL, 6), '0.5', '1000000000000000000', '2000000', '1000000000000000000', '1');
    expect(client.api.tx.poolXYK.withdrawLiquidity).toHaveBeenCalledWith(0, XOR, VAL, '500000000000000000', '494999999999999505', '989999');
  });
  it('matches the runtime minimum-liquidity adjustment and full-pool withdrawal', () => {
    expect(poolWithdrawal('500', '2000', '1000')).toBe('500');
    expect(poolWithdrawal('1000', '2000', '1000')).toBe('2000');
    expect(poolMarkerForAmount('500', '2000', '1000', '500')).toBe('500');
    expect(() => poolMarkerForAmount('501', '2000', '1000', '500')).toThrow();
    const { client } = fixture();
    expect(client.poolXyk.estimatePoolTokensMinted(asset(XOR, 0), asset(VAL, 0), '100', '100', '1000', '1000', '1000')[0]).toBe('200');
  });
  it('preserves withdrawal bounds for shares smaller than 18 decimal places', async () => {
    const { client } = fixture();
    vi.spyOn(client, 'submit').mockResolvedValue();
    await client.poolXyk.remove(asset(XOR), asset(VAL), '0.000000000000000001', '1000000000000000000000000', '2000000000000000000000000', '100000000000000000000000', '1');
    expect(client.api.tx.poolXYK.withdrawLiquidity).toHaveBeenCalledWith(0, XOR, VAL, '1', '8', '18');
  });
  it('rejects unsafe inputs before submission', async () => {
    const { client } = fixture();
    const submit = vi.spyOn(client, 'submit').mockResolvedValue();
    await expect(client.swap.execute(asset(XOR), asset(VAL), '1', '2', '100')).rejects.toThrow('slippage');
    await expect(client.poolXyk.remove(asset(XOR), asset(VAL), '1', '1', '1', '0', '1')).rejects.toThrow();
    for (const input of ['0', '-1', 'NaN', 'Infinity', '0.0000001']) expect(() => amount(input, 6)).toThrow();
    expect(submit).not.toHaveBeenCalled();
  });
  it('uses the chain RPC wire format without transforming integer amounts', async () => {
    const { client } = fixture();
    vi.spyOn(client.assets, 'getAssetInfo').mockResolvedValue(asset(VAL, 6));
    client.provider = { send: vi.fn().mockResolvedValue({ amount: '900719925474099312345', route: [XOR, VAL] }) } as Runtime;
    const quote = await client.swap.getResultFromDexRpc(XOR, VAL, '2.5', true);
    expect(client.provider!.send).toHaveBeenCalledWith('liquidityProxy_quote', [0, XOR, VAL, '2500000', 'WithDesiredOutput', [], 'Disabled']);
    expect(quote.amount).toBe('900719925474099312345');
  });
  it('encodes the Liberland bridge destination without a remote SDK', async () => {
    const { client } = fixture();
    vi.spyOn(client, 'submit').mockResolvedValue();
    await client.bridgeProxy.sub.transfer(asset(XOR), `0x${'01'.repeat(32)}`, '1', SubNetworkId.Liberland);
    expect(client.api.tx.bridgeProxy.burn).toHaveBeenCalledWith({ Sub: 'Liberland' }, XOR, { Liberland: `0x${'01'.repeat(32)}` }, '1000000000000000000');
  });
});
describe('local signing boundary', () => {
  it('rejects stale or locked signers before calling signAndSend', async () => {
    const { client, pair } = fixture();
    const tx = { signAndSend: vi.fn() };
    await expect(client.submit(tx, { ...pair })).rejects.toThrow('signer');
    pair.isLocked = true;
    await expect(client.submit(tx)).rejects.toThrow('signer');
    expect(tx.signAndSend).not.toHaveBeenCalled();
  });
  it('rejects transactions built against a replaced connection', async () => {
    const { client } = fixture();
    client.api.registry = {};
    const tx = { registry: {}, signAndSend: vi.fn() };
    await expect(client.submit(tx)).rejects.toThrow('runtime changed');
    expect(tx.signAndSend).not.toHaveBeenCalled();
  });
  it('waits for finalization and releases the subscription', async () => {
    const { client } = fixture();
    const stop = vi.fn();
    let callback: Runtime;
    const tx = { signAndSend: vi.fn((_pair, _options, cb) => { callback = cb; return Promise.resolve(stop); }) };
    const pending = client.submit(tx);
    await Promise.resolve();
    callback({ status: { isInBlock: true }, events: [] });
    expect(stop).not.toHaveBeenCalled();
    callback({ status: { isFinalized: true }, events: [] });
    await pending;
    expect(stop).toHaveBeenCalledOnce();
  });
  it('rejects dispatch errors and batch failures', async () => {
    for (const failure of [{ dispatchError: {} }, { events: [{ event: { section: 'utility', method: 'BatchInterrupted' } }] }]) {
      const { client } = fixture();
      const stop = vi.fn();
      const tx = { signAndSend: (_pair: Runtime, _options: Runtime, cb: Runtime) => { cb({ status: { isFinalized: true }, ...failure }); return Promise.resolve(stop); } };
      await expect(client.submit(tx)).rejects.toThrow('failed');
      expect(stop).toHaveBeenCalledOnce();
    }
  });
  it('releases asynchronous storage subscriptions after an early unsubscribe', async () => {
    const stop = vi.fn();
    let ready: (stop: () => void) => void;
    const stream = observe(() => new Promise<() => void>((resolve) => { ready = resolve; }), (value) => value);
    const subscription = stream.subscribe();
    subscription.unsubscribe();
    ready!(stop);
    await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce();
  });
});


describe('owned SORA fee refreshes', () => {
  function deferredFee() {
    let finish!: (value: string) => void;
    const promise = new Promise<string>((resolve) => { finish = resolve; });
    return { promise, finish };
  }
  function feeFixture() {
    const { client } = fixture();
    client.api.registry = {};
    client.api.tx = { staking: { bondExtra: () => ({}) } };
    return client;
  }

  it('rejects an old endpoint response without overwriting replacement fees', async () => {
    const client = feeFixture();
    const oldFee = deferredFee();
    vi.spyOn(client, 'fee').mockReturnValueOnce(oldFee.promise).mockResolvedValue('29');
    const oldRefresh = client.calcStaticNetworkFees();
    const rejected = expect(oldRefresh).rejects.toThrow('changed');

    client.api = { ...client.api, registry: {} };
    await client.calcStaticNetworkFees();
    expect(client.NetworkFee.StakingBondExtra).toBe('29');
    oldFee.finish('17');

    await rejected;
    expect(client.NetworkFee.StakingBondExtra).toBe('29');
  });

  it('rejects fees calculated before a registry replacement on the same API', async () => {
    const client = feeFixture();
    const pendingFee = deferredFee();
    const previousFees = { StakingBondExtra: '11' };
    client.NetworkFee = previousFees;
    vi.spyOn(client, 'fee').mockReturnValue(pendingFee.promise);
    const pending = client.calcStaticNetworkFees();
    const rejected = expect(pending).rejects.toThrow('changed');

    client.api.registry = {};
    pendingFee.finish('17');

    await rejected;
    expect(client.NetworkFee).toBe(previousFees);
  });

  it('does not let an earlier request replace a newer refresh on the same endpoint', async () => {
    const client = feeFixture();
    const earlierFee = deferredFee();
    vi.spyOn(client, 'fee').mockReturnValueOnce(earlierFee.promise).mockResolvedValue('29');
    const earlier = client.calcStaticNetworkFees();
    const rejected = expect(earlier).rejects.toThrow('changed');

    await client.calcStaticNetworkFees();
    expect(client.NetworkFee.StakingBondExtra).toBe('29');
    earlierFee.finish('17');

    await rejected;
    expect(client.NetworkFee.StakingBondExtra).toBe('29');
  });
});


describe('SORA submission uncertainty after broadcasting', () => {
  const hash = `0x${'ab'.repeat(32)}`;
  afterEach(() => vi.useRealTimers());

  function pendingSend() {
    const { client } = fixture();
    const stop = vi.fn();
    let callback!: (result: Runtime) => void;
    const tx = {
      isSigned: true, hash: { toHex: () => hash },
      signAndSend: vi.fn((_pair, _options, cb) => { callback = cb; return Promise.resolve(stop); }),
    };
    const pending = client.submit(tx);
    return { callback: (result: Runtime) => callback(result), pending, stop, tx };
  }

  it('retains an included transaction hash when confirmation times out, without broadcasting again', async () => {
    vi.useFakeTimers();
    const { callback, pending, stop, tx } = pendingSend();
    const rejected = expect(pending).rejects.toMatchObject({ outcome: 'unknown', transactionHash: hash.slice(2) });
    callback({ status: { isInBlock: true }, txHash: { toHex: () => hash }, events: [] });
    await vi.advanceTimersByTimeAsync(120_000);
    await rejected;
    expect(tx.signAndSend).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it.each(['isFinalityTimeout', 'isDropped', 'isUsurped', 'isInvalid'])(
    'preserves uncertainty when %s follows inclusion', async (status) => {
      const { callback, pending, stop } = pendingSend();
      callback({ status: { isInBlock: true }, txHash: { toHex: () => hash }, events: [] });
      callback({ status: { [status]: true }, events: [] });
      await expect(pending).rejects.toMatchObject({ outcome: 'unknown', transactionHash: hash.slice(2) });
      expect(stop).toHaveBeenCalledOnce();
    }
  );

  it('keeps invalid pre-inclusion transactions as definite rejections', async () => {
    const { callback, pending } = pendingSend();
    callback({ status: { isInvalid: true }, events: [] });
    const error = await pending.catch((value) => value);
    expect(error.message).toBe('SORA transaction was rejected');
    expect(soraSubmissionUnknownResponse(error)).toBeNull();
  });

  it('does not settle a provisional dispatch failure until the block finalizes', async () => {
    const { callback, pending } = pendingSend();
    let settled = false;
    const rejection = pending.catch((error) => { settled = true; return error; });
    callback({ status: { isInBlock: true }, dispatchError: {}, events: [] });
    await Promise.resolve();
    expect(settled).toBe(false);
    callback({ status: { isFinalized: true }, dispatchError: {}, events: [] });
    const error = await rejection;
    expect(error.message).toBe('SORA transaction failed on chain');
    expect(soraSubmissionUnknownResponse(error)).toBeNull();
  });

  it('does not claim success if finalized dispatch events could not be fetched', async () => {
    const { callback, pending } = pendingSend();
    callback({ status: { isFinalized: true }, internalError: new Error('private provider error'), events: [] });
    await expect(pending).rejects.toBeInstanceOf(SoraSubmissionUnknownError);
  });

  it.each([true, false])('preserves transport uncertainty, including when signed hash availability is %s', async (signed) => {
    const { client } = fixture();
    const tx = {
      isSigned: signed, hash: { toHex: () => hash },
      signAndSend: vi.fn().mockRejectedValue(new Error('private transport detail')),
    };
    const error = await client.submit(tx).catch((value) => value);
    expect(soraSubmissionUnknownResponse(error)).toEqual({
      status: false, outcome: 'unknown', ...(signed ? { transactionHash: hash.slice(2) } : {}),
      errors: [{ message: 'sora_broadcast_ambiguous' }],
    });
    expect(tx.signAndSend).toHaveBeenCalledOnce();
  });

  it.each([
    Object.defineProperty(new Error('private RPC rejection detail'), 'code', { value: 1010 }),
    new Error('1010: Invalid Transaction: Inability to pay some fees'),
    '1010: Invalid Transaction: Inability to pay some fees',
    ...[1001, 1002, 1011, 1012, 1014, 1015, 1016, 1018, 1019, 1020, 1021].map(code => ({ code })),
  ])('preserves a definite asynchronous pool rejection after local signing: %s', async (rejection) => {
    const { client } = fixture();
    const tx = {
      isSigned: true, hash: { toHex: () => hash },
      signAndSend: vi.fn().mockRejectedValue(rejection),
    };
    const error = await client.submit(tx).catch(value => value);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('SORA transaction was rejected');
    expect(soraSubmissionUnknownResponse(error)).toBeNull();
    expect(tx.signAndSend).toHaveBeenCalledOnce();
  });

  it.each([
    { code: 1013, message: 'already imported' },
    Object.assign(new Error('1010: misleading error text'), { code: 1013 }),
    new Error('1013: Transaction Already Imported'),
    { code: 1040 }, { code: -32603 }, new Error('Connection closed'),
  ])('keeps non-definite RPC errors uncertain: %s', async (rejection) => {
    const { client } = fixture();
    const tx = {
      isSigned: true, hash: { toHex: () => hash },
      signAndSend: vi.fn().mockRejectedValue(rejection),
    };
    await expect(client.submit(tx)).rejects.toMatchObject({ outcome: 'unknown', transactionHash: hash.slice(2) });
    expect(tx.signAndSend).toHaveBeenCalledOnce();
  });

  it.each(['isReady', 'isBroadcast', 'isInBlock'])(
    'does not reinterpret a late pool error as rejection after %s', async (status) => {
      const { client } = fixture();
      const tx = {
        isSigned: true, hash: { toHex: () => hash },
        signAndSend: vi.fn((_pair, _options, callback) => {
          callback({ status: { [status]: true }, txHash: { toHex: () => hash }, events: [] });
          return Promise.reject(Object.assign(new Error('1010: late RPC error'), { code: 1010 }));
        }),
      };
      await expect(client.submit(tx)).rejects.toMatchObject({ outcome: 'unknown', transactionHash: hash.slice(2) });
      expect(tx.signAndSend).toHaveBeenCalledOnce();
    }
  );

  it('preserves a synchronous rejection before signing as a definite failure', async () => {
    const { client } = fixture();
    const error = new Error('invalid local signing options');
    await expect(client.submit({ isSigned: false, signAndSend: () => { throw error; } })).rejects.toBe(error);
    expect(soraSubmissionUnknownResponse(error)).toBeNull();
  });

  it('drops malformed hashes and excludes diagnostic text from messaging responses', () => {
    const response = soraSubmissionUnknownResponse(new SoraSubmissionUnknownError('<provider-secret>'));
    expect(response).toEqual({ status: false, outcome: 'unknown', errors: [{ message: 'sora_broadcast_ambiguous' }] });
  });
});
