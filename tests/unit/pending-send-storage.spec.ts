import { createStorageBitcoinPendingSendStore, type BitcoinPendingSend } from '@extension-base/api/bitcoin/pendingSends';
import { createStorageSolanaPendingSendStore, type SolanaPendingSend } from '@extension-base/api/solana/pendingSends';

import vectors from '../../docs/universal-wallet-v2-vectors.json';
import { buildBitcoinP2wpkhTransaction } from '@/util/bitcoinTransaction';

const publicTransaction = (vout = 0) => buildBitcoinP2wpkhTransaction({
  mnemonicOrSeed: vectors.vectors[0].mnemonic,
  inputs: [{ txid: '11'.repeat(32), value: 100_000, vout }],
  outputs: [{ address: vectors.vectors[1].expected.bitcoin.mainnet.firstReceiveAddress, value: 99_000 }],
  feeSat: 1_000,
});

// These stores are the durable duplicate-payment barrier after a worker restart.
// Exercise actual read-modify-write behavior with public signed-data fixtures.
describe.each(['bitcoin', 'solana'] as const)('%s pending send evidence', chain => {
  it.each([{}, [null], [{ network: 'mainnet', accountAddress: 'damaged public record' }]])('refuses damaged pending storage without overwriting it: %j', async damaged => {
    const key = chain === 'bitcoin' ? 'bitcoinPendingSends' : 'solanaPendingSends';
    const backend = { get: async () => ({ [key]: structuredClone(damaged) }), set: vi.fn(async () => {}) };
    const store = chain === 'bitcoin' ? createStorageBitcoinPendingSendStore(backend as never)
      : createStorageSolanaPendingSendStore(backend as never);
    await expect(store.list()).rejects.toThrow('Invalid saved pending transaction records');
    await expect(store.remove(['public id'])).rejects.toThrow('Invalid saved pending transaction records');
    expect(backend.set).not.toHaveBeenCalled();
  });

  it.each(chain === 'bitcoin' ? ['empty inputs', 'wrong transaction id', 'wrong input index'] : ['negative expiry'])('rejects inconsistent transaction evidence: %s', async damage => {
    const tx = publicTransaction();
    const record = chain === 'bitcoin'
      ? { accountAddress: 'a', network: 'mainnet', txHex: tx.txHex, txid: tx.txid,
        outpoints: [{ txid: '11'.repeat(32), vout: 0 }] }
      : { accountAddress: 'a', network: 'mainnet', signature: 'public signature', transactionBase64: 'AQID', lastValidBlockHeight: -1 };
    if (damage === 'empty inputs') record.outpoints = [];
    if (damage === 'wrong transaction id') record.txid = '22'.repeat(32);
    if (damage === 'wrong input index') record.outpoints![0].vout = 1;
    const key = chain === 'bitcoin' ? 'bitcoinPendingSends' : 'solanaPendingSends';
    const backend = { get: async () => ({ [key]: [record] }), set: vi.fn(async () => {}) };
    const store = chain === 'bitcoin' ? createStorageBitcoinPendingSendStore(backend as never)
      : createStorageSolanaPendingSendStore(backend as never);
    await expect(store.list()).rejects.toThrow('Invalid saved pending transaction records');
    expect(backend.set).not.toHaveBeenCalled();
  });

  it('preserves original duplicates, other networks and more than fifty unresolved sends', async () => {
    const key = chain === 'bitcoin' ? 'bitcoinPendingSends' : 'solanaPendingSends';
    let stored: unknown[] = [];
    const backend = { get: async () => ({ [key]: structuredClone(stored) }),
      set: async (value: Record<string, unknown[]>) => { stored = structuredClone(value[key]); } };
    const bitcoinStore = createStorageBitcoinPendingSendStore(backend as never);
    const solanaStore = createStorageSolanaPendingSendStore(backend as never);
    const id = (index: number) => index.toString(16).padStart(64, '0');
    const record = (index: number) => {
      const tx = publicTransaction(index);
      return chain === 'bitcoin'
      ? { accountAddress: 'public account', amountSat: 1, createdAt: index, network: 'mainnet',
        outpoints: [{ txid: '11'.repeat(32), vout: index }], recipient: 'public recipient', txHex: tx.txHex, txid: tx.txid }
      : { accountAddress: 'public account', createdAt: index, network: 'mainnet',
        lastValidBlockHeight: 456, signature: id(index), transactionBase64: 'AQID' };
    };
    const save = (value: ReturnType<typeof record>) => chain === 'bitcoin'
      ? bitcoinStore.save(value as BitcoinPendingSend) : solanaStore.save(value as SolanaPendingSend);
    await Promise.all(Array.from({ length: 55 }, (_, index) => save(record(index))));
    expect(stored).toHaveLength(55);
    const original = structuredClone(stored);
    await save({ ...record(0), createdAt: 999 });
    expect(stored).toEqual(original);
    const other = { ...record(0), network: chain === 'bitcoin' ? 'testnet' : 'devnet' };
    await save(other);
    expect(stored).toEqual([...original, other]);
    if (chain === 'bitcoin') await bitcoinStore.remove([record(0).txid!], 'mainnet');
    else await solanaStore.remove([id(0)], 'mainnet');
    expect(stored).toEqual([...original.slice(1), other]);
  });
});
