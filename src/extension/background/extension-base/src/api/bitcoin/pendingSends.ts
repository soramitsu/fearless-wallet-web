import { storage } from '@extension-base/stores/Storage';
import type { BitcoinEsploraClient } from '@extension-base/services/bitcoin-indexer-service';
import type { BitcoinNetworkKind } from '@/util/bitcoin';
import type { BitcoinOutpoint } from '@/util/bitcoinSend';

/**
 * A signed Bitcoin transaction recorded before it is broadcast and kept until
 * the indexer proves its outcome.
 *
 * The record holds only public data (the signed transaction and its inputs),
 * never key material. While a record is unresolved, the next send from the same
 * account spends every one of its inputs again, so the two transactions
 * conflict and the network can confirm at most one of them: a retry after an
 * ambiguous broadcast can never pay twice.
 */
export type BitcoinPendingSend = {
  accountAddress: string;
  amountSat: number;
  createdAt: number;
  network: BitcoinNetworkKind;
  outpoints: BitcoinOutpoint[];
  recipient: string;
  txHex: string;
  txid: string;
};

export type BitcoinPendingSendStore = {
  list: () => Promise<BitcoinPendingSend[]>;
  remove: (txids: string[]) => Promise<void>;
  save: (record: BitcoinPendingSend) => Promise<void>;
};

export type BitcoinPendingSendClient = Pick<BitcoinEsploraClient, 'getOutspend' | 'getTransactionStatus'>;

const MAX_PENDING_SENDS = 50;

const isPendingSend = (value: unknown): value is BitcoinPendingSend => {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.accountAddress === 'string' &&
    typeof record.txid === 'string' &&
    /^[0-9a-f]{64}$/u.test(record.txid) &&
    typeof record.txHex === 'string' &&
    (record.network === 'mainnet' || record.network === 'testnet') &&
    Array.isArray(record.outpoints) &&
    record.outpoints.every(
      (outpoint) =>
        typeof outpoint === 'object' &&
        outpoint !== null &&
        typeof (outpoint as BitcoinOutpoint).txid === 'string' &&
        Number.isInteger((outpoint as BitcoinOutpoint).vout)
    )
  );
};

export function createStorageBitcoinPendingSendStore(
  backend: Pick<typeof storage, 'get' | 'set'> = storage
): BitcoinPendingSendStore {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<BitcoinPendingSend[]> => {
    const { bitcoinPendingSends } = await backend.get(['bitcoinPendingSends']);

    return Array.isArray(bitcoinPendingSends) ? bitcoinPendingSends.filter(isPendingSend) : [];
  };
  // Serialise read-modify-write so two sends never drop each other's record.
  const update = (change: (records: BitcoinPendingSend[]) => BitcoinPendingSend[]): Promise<void> => {
    const next = queue.then(async () => backend.set({ bitcoinPendingSends: change(await read()) }));

    queue = next.catch(() => undefined);

    return next;
  };

  return {
    list: read,
    remove: (txids) => update((records) => records.filter(({ txid }) => !txids.includes(txid))),
    save: (record) =>
      update((records) => [...records.filter(({ txid }) => txid !== record.txid), record].slice(-MAX_PENDING_SENDS)),
  };
}

let defaultStore: BitcoinPendingSendStore | undefined;

export const getDefaultBitcoinPendingSendStore = (): BitcoinPendingSendStore =>
  (defaultStore ??= createStorageBitcoinPendingSendStore());

/**
 * Splits the account's pending sends into those whose outcome the indexer has
 * proven (seen on chain or in the mempool, or one of their coins was spent by a
 * different transaction) and those still unknown. Any lookup failure keeps a
 * record unresolved: when in doubt the conflict guarantee stays in force.
 */
export async function resolveBitcoinPendingSends(
  records: BitcoinPendingSend[],
  client: BitcoinPendingSendClient
): Promise<{ resolved: BitcoinPendingSend[]; unresolved: BitcoinPendingSend[] }> {
  const resolved: BitcoinPendingSend[] = [];
  const unresolved: BitcoinPendingSend[] = [];

  for (const record of records) {
    try {
      if (await client.getTransactionStatus(record.txid)) {
        resolved.push(record);
        continue;
      }

      const outspends = await Promise.all(record.outpoints.map(({ txid, vout }) => client.getOutspend(txid, vout)));

      if (outspends.some(({ spent }) => spent)) resolved.push(record);
      else unresolved.push(record);
    } catch {
      unresolved.push(record);
    }
  }

  return { resolved, unresolved };
}
