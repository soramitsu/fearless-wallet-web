import { storage } from '@extension-base/stores/Storage';
import type { SolanaRpcClient, SolanaRpcNetwork } from '@extension-base/services/solana-rpc-service';

/**
 * A signed Solana transaction recorded before it is broadcast and kept until
 * the network proves its outcome: the signature landed (successfully or not),
 * or its blockhash expired so it can never land.
 *
 * A Solana transaction cannot be made to conflict with an earlier one, so while
 * a record is unresolved the wallet refuses to sign a new send from the same
 * account; it only rebroadcasts the identical signed bytes. The record holds
 * only public data, never key material.
 */
export type SolanaPendingSend = {
  accountAddress: string;
  createdAt: number;
  lastValidBlockHeight: number;
  network: SolanaRpcNetwork;
  signature: string;
  transactionBase64: string;
};

export type SolanaPendingSendStore = {
  list: () => Promise<SolanaPendingSend[]>;
  remove: (signatures: string[]) => Promise<void>;
  save: (record: SolanaPendingSend) => Promise<void>;
};

export type SolanaPendingSendClient = Pick<
  SolanaRpcClient,
  'getBlockHeight' | 'getSignatureStatuses' | 'sendRawTransaction'
>;

const MAX_PENDING_SENDS = 50;

const isPendingSend = (value: unknown): value is SolanaPendingSend => {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.accountAddress === 'string' &&
    typeof record.signature === 'string' &&
    typeof record.transactionBase64 === 'string' &&
    Number.isSafeInteger(record.lastValidBlockHeight) &&
    (record.network === 'mainnet' || record.network === 'devnet')
  );
};

export function createStorageSolanaPendingSendStore(
  backend: Pick<typeof storage, 'get' | 'set'> = storage
): SolanaPendingSendStore {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<SolanaPendingSend[]> => {
    const { solanaPendingSends } = await backend.get(['solanaPendingSends']);

    return Array.isArray(solanaPendingSends) ? solanaPendingSends.filter(isPendingSend) : [];
  };
  const update = (change: (records: SolanaPendingSend[]) => SolanaPendingSend[]): Promise<void> => {
    const next = queue.then(async () => backend.set({ solanaPendingSends: change(await read()) }));

    queue = next.catch(() => undefined);

    return next;
  };

  return {
    list: read,
    remove: (signatures) => update((records) => records.filter(({ signature }) => !signatures.includes(signature))),
    save: (record) =>
      update((records) =>
        [...records.filter(({ signature }) => signature !== record.signature), record].slice(-MAX_PENDING_SENDS)
      ),
  };
}

let defaultStore: SolanaPendingSendStore | undefined;

export const getDefaultSolanaPendingSendStore = (): SolanaPendingSendStore =>
  (defaultStore ??= createStorageSolanaPendingSendStore());

/**
 * Splits pending sends into resolved (the signature has a status, or its
 * blockhash expired with no status) and still in flight. Lookup failures keep a
 * record in flight. In-flight transactions are rebroadcast unchanged, which is
 * idempotent and helps them land before they expire.
 */
export async function resolveSolanaPendingSends(
  records: SolanaPendingSend[],
  client: SolanaPendingSendClient
): Promise<{ resolved: SolanaPendingSend[]; unresolved: SolanaPendingSend[] }> {
  if (!records.length) return { resolved: [], unresolved: [] };

  try {
    const [statuses, blockHeight] = await Promise.all([
      client.getSignatureStatuses(records.map(({ signature }) => signature)),
      client.getBlockHeight('confirmed'),
    ]);
    const resolved: SolanaPendingSend[] = [];
    const unresolved: SolanaPendingSend[] = [];

    records.forEach((record, index) => {
      if (statuses[index] || blockHeight > record.lastValidBlockHeight) resolved.push(record);
      else unresolved.push(record);
    });

    await Promise.all(
      unresolved.map(({ transactionBase64 }) =>
        client
          .sendRawTransaction(transactionBase64, { maxRetries: 0, skipPreflight: true })
          .catch(() => undefined)
      )
    );

    return { resolved, unresolved };
  } catch {
    return { resolved: [], unresolved: records };
  }
}
