import { Transaction } from 'bitcoinjs-lib';
import { storage } from '@extension-base/stores/Storage';
import type { BitcoinEsploraClient } from '@extension-base/services/bitcoin-indexer-service';
import type { BitcoinNetworkKind } from '@/util/bitcoin';
import type { BitcoinOutpoint } from '@/util/bitcoinSend';

/**
 * A signed Bitcoin transaction recorded before it is broadcast and kept until
 * the indexer proves its outcome.
 *
 * The record holds only public data (the signed transaction and its inputs),
 * never key material. While the outcome is unknown, the next send from the same
 * account spends every one of its inputs again, so the two transactions
 * conflict and the network can confirm at most one of them. Once the indexer
 * sees the transaction waiting in the mempool its coins are no longer listed,
 * so no new transaction could conflict with it; the account then sends nothing
 * new until it confirms. Either way a retry after an ambiguous broadcast can
 * never pay twice.
 */
export type BitcoinPendingSend = {
  accountAddress: string;
  // On-chain sender identity is shared by aliases of the same imported key.
  senderAddress?: string;
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
  remove: (txids: string[], network?: BitcoinNetworkKind) => Promise<void>;
  save: (record: BitcoinPendingSend) => Promise<void>;
};

export type BitcoinPendingSendClient = Pick<BitcoinEsploraClient, 'getOutspend' | 'getTransactionStatus'>;

const isPendingSend = (value: unknown): value is BitcoinPendingSend => {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;

  if (
    typeof record.accountAddress !== 'string' ||
    typeof record.txid !== 'string' || !/^[0-9a-f]{64}$/u.test(record.txid) ||
    typeof record.txHex !== 'string' || !/^(?:[0-9a-f]{2})+$/iu.test(record.txHex) ||
    (record.network !== 'mainnet' && record.network !== 'testnet') ||
    !Array.isArray(record.outpoints) || record.outpoints.length === 0 ||
    !record.outpoints.every(outpoint => typeof outpoint === 'object' && outpoint !== null &&
      typeof outpoint.txid === 'string' && /^[0-9a-f]{64}$/iu.test(outpoint.txid) &&
      Number.isInteger(outpoint.vout) && outpoint.vout >= 0 && outpoint.vout <= 0xffffffff)
  ) return false;

  try {
    const transaction = Transaction.fromHex(record.txHex);
    const inputs = transaction.ins.map(({ hash, index }) =>
      `${Array.from(hash).reverse().map(byte => byte.toString(16).padStart(2, '0')).join('')}:${index}`
    );
    const declared = record.outpoints.map(({ txid, vout }) => `${txid.toLowerCase()}:${vout}`);
    return transaction.getId() === record.txid && new Set(inputs).size === inputs.length &&
      inputs.length === declared.length && new Set(declared).size === declared.length &&
      inputs.every(input => declared.includes(input));
  } catch { return false; }
};

export function createStorageBitcoinPendingSendStore(
  backend: Pick<typeof storage, 'get' | 'set'> = storage
): BitcoinPendingSendStore {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<BitcoinPendingSend[]> => {
    const { bitcoinPendingSends } = await backend.get(['bitcoinPendingSends']);

    if (bitcoinPendingSends === undefined) return [];
    if (!Array.isArray(bitcoinPendingSends) || !bitcoinPendingSends.every(isPendingSend))
      throw new Error('Invalid saved pending transaction records.');
    return bitcoinPendingSends;
  };
  // Serialise read-modify-write so two sends never drop each other's record.
  const update = (change: (records: BitcoinPendingSend[]) => BitcoinPendingSend[]): Promise<void> => {
    const next = queue.then(async () => backend.set({ bitcoinPendingSends: change(await read()) }));

    queue = next.catch(() => undefined);

    return next;
  };

  return {
    list: read,
    remove: (txids, network) => update((records) => records.filter((record) =>
      !txids.includes(record.txid) || (network !== undefined && record.network !== network)
    )),
    // Keep the original evidence for an identical retry. Never evict unresolved
    // transactions merely because other accounts added more pending sends.
    save: (record) => update((records) =>
      records.some((existing) => existing.txid === record.txid && existing.network === record.network)
        ? records : [...records, record]
    ),
  };
}

let defaultStore: BitcoinPendingSendStore | undefined;

export const getDefaultBitcoinPendingSendStore = (): BitcoinPendingSendStore =>
  (defaultStore ??= createStorageBitcoinPendingSendStore());

/**
 * Sorts the account's pending sends by what the indexer proves about them:
 * - `resolved`: the transaction confirmed, or one of its coins was spent by a
 *   different transaction, so it can never confirm;
 * - `inMempool`: the network has the transaction but has not confirmed it.
 *   Its coins are no longer listed as spendable, so a new transaction cannot
 *   conflict with it, and a new send has to wait until it confirms;
 * - `unresolved`: the outcome is unknown, so the next send spends every one of
 *   its coins again.
 * Any lookup failure keeps a record unresolved: when in doubt the conflict
 * guarantee stays in force.
 */
export async function resolveBitcoinPendingSends(
  records: BitcoinPendingSend[],
  client: BitcoinPendingSendClient
): Promise<{ inMempool: BitcoinPendingSend[]; resolved: BitcoinPendingSend[]; unresolved: BitcoinPendingSend[] }> {
  const inMempool: BitcoinPendingSend[] = [];
  const resolved: BitcoinPendingSend[] = [];
  const unresolved: BitcoinPendingSend[] = [];

  for (const record of records) {
    try {
      const status = await client.getTransactionStatus(record.txid);

      if (status) {
        (status.confirmed ? resolved : inMempool).push(record);
        continue;
      }

      const outspends = await Promise.all(record.outpoints.map(({ txid, vout }) => client.getOutspend(txid, vout)));

      if (outspends.some(({ spent, txid }) => spent && txid !== undefined && txid !== record.txid)) {
        resolved.push(record);
      } else if (outspends.some(({ spent, txid }) => spent && txid === record.txid)) {
        // Endpoints can lag each other: one that names this transaction as the
        // spender of its coin has it, whatever the status lookup said.
        inMempool.push(record);
      } else {
        unresolved.push(record);
      }
    } catch {
      unresolved.push(record);
    }
  }

  return { inMempool, resolved, unresolved };
}
