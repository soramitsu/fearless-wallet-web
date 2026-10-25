import {
  CrossChainSendLedger,
  crossChainSendRecordKey,
  type CrossChainSendRecord,
  type CrossChainSendRecords,
  type CrossChainSendResolutionApi,
} from '@/cross-chain/sendLedger';

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const BOB = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const ROUTE = 'reviewed-v1:wallet-xcm:polkadot:asset-hub:dot';
const NOW = 1_800_000_000_000;

const record = (overrides: Partial<CrossChainSendRecord> = {}): CrossChainSendRecord => ({
  address: ALICE,
  routeId: ROUTE,
  originNet: 'Polkadot',
  nonce: 7,
  hash: 'ab'.repeat(32),
  expiresAtBlock: 1_064,
  recordedAt: NOW,
  ...overrides,
});

function memoryStore(initial: unknown = undefined) {
  let stored: unknown = initial;
  const store = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (records: CrossChainSendRecords) => {
      stored = JSON.parse(JSON.stringify(records));
    }),
  };

  return { store, stored: () => stored as CrossChainSendRecords | undefined };
}

const chain = ({ head = 1_000, nonce = 7, fail = false }: { head?: number; nonce?: number; fail?: boolean } = {}) =>
  ({
    rpc: {
      chain: {
        getHeader: vi.fn(async () => {
          if (fail) throw new Error('No response received from RPC endpoint in 60s');

          return { number: { toNumber: () => head } };
        }),
      },
    },
    query: { system: { account: vi.fn(async () => ({ nonce: { toNumber: () => nonce } })) } },
  }) satisfies CrossChainSendResolutionApi;

describe('cross-chain send ledger', () => {
  it('lets one send run per account at a time', () => {
    const ledger = new CrossChainSendLedger(memoryStore().store);
    const release = ledger.beginSend(ALICE);

    expect(() => ledger.beginSend(ALICE)).toThrow('cross_chain_send_in_progress');
    expect(ledger.isSending(ALICE)).toBe(true);

    const releaseBob = ledger.beginSend(BOB);
    release();
    release();

    expect(ledger.isSending(ALICE)).toBe(false);
    expect(ledger.isSending(BOB)).toBe(true);
    expect(() => ledger.beginSend(ALICE)).not.toThrow();
    releaseBob();
  });

  it('reports nothing for a route without a record and never asks the chain', async () => {
    const api = chain();
    const ledger = new CrossChainSendLedger(memoryStore().store);

    await expect(ledger.inspect(ALICE, ROUTE, api)).resolves.toEqual({ state: 'none' });
    expect(api.rpc.chain.getHeader).not.toHaveBeenCalled();
  });

  it('keeps a recorded send pending while it can still be included', async () => {
    const { store } = memoryStore();
    const ledger = new CrossChainSendLedger(store, () => NOW);
    await ledger.record(record());

    await expect(ledger.inspect(ALICE, ROUTE, chain({ head: 1_063, nonce: 7 }))).resolves.toEqual({
      state: 'pending',
      record: record(),
    });
    await expect(ledger.inspect(ALICE, 'another-route', chain())).resolves.toEqual({ state: 'none' });
    await expect(ledger.inspect(BOB, ROUTE, chain())).resolves.toEqual({ state: 'none' });
  });

  it('reports a used nonce as final and leaves clearing to the send that reports it', async () => {
    const { store, stored } = memoryStore();
    const ledger = new CrossChainSendLedger(store, () => NOW);
    await ledger.record(record());

    await expect(ledger.inspect(ALICE, ROUTE, chain({ head: 1_010, nonce: 8 }))).resolves.toEqual({
      state: 'consumed',
      record: record(),
    });
    expect(stored()?.[crossChainSendRecordKey(ALICE, ROUTE)]).toEqual(record());
  });

  it('forgets a send that expired without using its nonce: it can never be included', async () => {
    const { store, stored } = memoryStore();
    const ledger = new CrossChainSendLedger(store, () => NOW);
    await ledger.record(record());

    await expect(ledger.inspect(ALICE, ROUTE, chain({ head: 1_064, nonce: 7 }))).resolves.toEqual({ state: 'none' });
    expect(stored()).toEqual({});
  });

  it('reads the head before the nonce so the nonce covers every block up to it', async () => {
    const order: string[] = [];
    const api = chain({ head: 2_000 });
    api.rpc.chain.getHeader.mockImplementation(async () => {
      order.push('head');

      return { number: { toNumber: () => 2_000 } };
    });
    api.query.system.account.mockImplementation(async () => {
      order.push('nonce');

      return { nonce: { toNumber: () => 7 } };
    });
    const ledger = new CrossChainSendLedger(memoryStore().store, () => NOW);
    await ledger.record(record());

    await ledger.inspect(ALICE, ROUTE, api);

    expect(order).toEqual(['head', 'nonce']);
    expect(api.query.system.account).toHaveBeenCalledWith(ALICE);
  });

  it('keeps an immortal send pending until its nonce is used', async () => {
    const ledger = new CrossChainSendLedger(memoryStore().store, () => NOW);
    await ledger.record(record({ expiresAtBlock: null }));

    await expect(ledger.inspect(ALICE, ROUTE, chain({ head: 10_000_000, nonce: 7 }))).resolves.toMatchObject({
      state: 'pending',
    });
    await expect(ledger.inspect(ALICE, ROUTE, chain({ head: 10_000_000, nonce: 9 }))).resolves.toMatchObject({
      state: 'consumed',
    });
  });

  it('keeps the route blocked when the chain cannot be read', async () => {
    const ledger = new CrossChainSendLedger(memoryStore().store, () => NOW);
    await ledger.record(record());

    await expect(ledger.inspect(ALICE, ROUTE, chain({ fail: true }))).resolves.toMatchObject({ state: 'pending' });
    await expect(ledger.inspect(ALICE, ROUTE, undefined as unknown as CrossChainSendResolutionApi)).resolves.toMatchObject({
      state: 'pending',
    });
  });

  it('clears only the record of the same extrinsic', async () => {
    const { store, stored } = memoryStore();
    const ledger = new CrossChainSendLedger(store, () => NOW);
    await ledger.record(record({ hash: 'cd'.repeat(32) }));

    await ledger.clear(ALICE, ROUTE, 'ab'.repeat(32));
    expect(stored()?.[crossChainSendRecordKey(ALICE, ROUTE)]?.hash).toBe('cd'.repeat(32));

    await ledger.clear(ALICE, ROUTE, 'cd'.repeat(32));
    expect(stored()).toEqual({});
  });

  it('refuses to write a malformed record', async () => {
    const { store } = memoryStore();
    const ledger = new CrossChainSendLedger(store, () => NOW);

    await expect(ledger.record(record({ hash: '0xabc' }))).rejects.toThrow('cross_chain_send_record_invalid');
    await expect(ledger.record(record({ nonce: -1 }))).rejects.toThrow('cross_chain_send_record_invalid');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('passes a storage failure to the sender, which must then not send', async () => {
    const { store } = memoryStore();
    store.save.mockRejectedValueOnce(new Error('QuotaExceededError'));
    const ledger = new CrossChainSendLedger(store, () => NOW);

    await expect(ledger.record(record())).rejects.toThrow('QuotaExceededError');
    await expect(ledger.record(record())).resolves.toBeUndefined();
  });

  it('keeps records written concurrently for different accounts', async () => {
    const { store, stored } = memoryStore();
    const ledger = new CrossChainSendLedger(store, () => NOW);

    await Promise.all([ledger.record(record()), ledger.record(record({ address: BOB, hash: 'cd'.repeat(32) }))]);

    expect(Object.keys(stored() ?? {})).toHaveLength(2);
  });

  it('ignores malformed stored entries and drops mortal records past retention, keeping immortal ones', async () => {
    const old = NOW - 8 * 24 * 60 * 60 * 1000;
    const immortal = record({ address: BOB, expiresAtBlock: null, recordedAt: old });
    const { store, stored } = memoryStore({
      [crossChainSendRecordKey(ALICE, ROUTE)]: record({ recordedAt: old }),
      [crossChainSendRecordKey(BOB, ROUTE)]: immortal,
      [crossChainSendRecordKey(ALICE, 'tampered')]: record(),
      junk: 'value',
    });
    const ledger = new CrossChainSendLedger(store, () => NOW);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(ledger.inspect(ALICE, ROUTE, chain())).resolves.toEqual({ state: 'none' });
    await expect(ledger.inspect(BOB, ROUTE, chain())).resolves.toMatchObject({ state: 'pending' });

    await ledger.record(record({ routeId: 'next-route' }));
    expect(Object.keys(stored() ?? {}).sort()).toEqual(
      [crossChainSendRecordKey(BOB, ROUTE), crossChainSendRecordKey(ALICE, 'next-route')].sort()
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it.each([undefined, null, {}, [], 'text'])('treats stored value %j as no records', async (initial) => {
    const ledger = new CrossChainSendLedger(memoryStore(initial).store, () => NOW);

    await expect(ledger.inspect(ALICE, ROUTE, chain())).resolves.toEqual({ state: 'none' });
  });
});
