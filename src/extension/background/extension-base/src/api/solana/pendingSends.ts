import { ed25519 } from '@noble/curves/ed25519';
import { base58Decode, base58Encode } from '@polkadot/util-crypto';
import { storage } from '@extension-base/stores/Storage';
import { isConfirmedSolanaStatus } from '@extension-base/services/solana-rpc-service';
import type { SolanaRpcClient, SolanaRpcNetwork } from '@extension-base/services/solana-rpc-service';
import { parseSolanaSerializedTransaction } from '@/util/solanaTransaction';

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
  // On-chain sender identity is shared by aliases of the same imported key.
  senderAddress?: string;
  createdAt: number;
  lastValidBlockHeight: number;
  network: SolanaRpcNetwork;
  signature: string;
  transactionBase64: string;
};

export type SolanaPendingSendStore = {
  list: () => Promise<SolanaPendingSend[]>;
  remove: (signatures: string[], network?: SolanaRpcNetwork) => Promise<void>;
  save: (record: SolanaPendingSend) => Promise<void>;
};

export type SolanaPendingSendClient = Pick<SolanaRpcClient, 'resolveSignatures' | 'sendRawTransaction'>;

export { isConfirmedSolanaStatus };

// An expiry means "nothing was sent" only when two distinct hosts each proved it, and only while the record is young
// enough for the public nodes to still hold its history (about 9 h on api.mainnet-beta, 22 h on Solana Vibe Station,
// 50 h on PublicNode, measured 2026-10-24). One host's "no trace" can come from a backend that lacks the history.
export const SOLANA_EXPIRY_PROOF_HOSTS = 2;
export const SOLANA_EXPIRY_TRUST_MS = 6 * 60 * 60_000;

export function isCorroboratedSolanaExpiry(provingHosts: number, createdAt: unknown, now: number): boolean {
  return (
    provingHosts >= SOLANA_EXPIRY_PROOF_HOSTS &&
    typeof createdAt === 'number' &&
    Number.isSafeInteger(createdAt) &&
    createdAt <= now &&
    now - createdAt < SOLANA_EXPIRY_TRUST_MS
  );
}

const isPendingSend = (value: unknown): value is SolanaPendingSend => {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.accountAddress === 'string' &&
    typeof record.signature === 'string' &&
    typeof record.transactionBase64 === 'string' &&
    Number.isSafeInteger(record.lastValidBlockHeight) && Number(record.lastValidBlockHeight) >= 0 &&
    (record.network === 'mainnet' || record.network === 'devnet')
  );
};

export function createStorageSolanaPendingSendStore(
  backend: Pick<typeof storage, 'get' | 'set'> = storage
): SolanaPendingSendStore {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<SolanaPendingSend[]> => {
    const { solanaPendingSends } = await backend.get(['solanaPendingSends']);

    if (solanaPendingSends === undefined) return [];
    if (!Array.isArray(solanaPendingSends) || !solanaPendingSends.every(isPendingSend))
      throw new Error('Invalid saved pending transaction records.');
    return solanaPendingSends;
  };
  const update = (change: (records: SolanaPendingSend[]) => SolanaPendingSend[]): Promise<void> => {
    const next = queue.then(async () => backend.set({ solanaPendingSends: change(await read()) }));

    queue = next.catch(() => undefined);

    return next;
  };

  return {
    list: read,
    remove: (signatures, network) => update((records) => records.filter((record) =>
      !signatures.includes(record.signature) || (network !== undefined && record.network !== network)
    )),
    // Keep the original evidence for an identical retry. Never evict unresolved
    // transactions merely because other accounts added more pending sends.
    save: (record) => update((records) =>
      records.some((existing) => existing.signature === record.signature && existing.network === record.network)
        ? records : [...records, record]
    ),
  };
}

let defaultStore: SolanaPendingSendStore | undefined;

export const getDefaultSolanaPendingSendStore = (): SolanaPendingSendStore =>
  (defaultStore ??= createStorageSolanaPendingSendStore());

/**
 * Splits pending sends into resolved, unverified and still in flight. A record
 * is resolved once its outcome can no longer change: the signature is confirmed
 * (successfully or not), or two distinct hosts have each finalized past its
 * last valid block height and still have no trace of it, after which the bytes
 * can never be included again (`SolanaRpcClient.resolveSignatures` holds the
 * per-node rule), and the record is young enough to trust that (see
 * `isCorroboratedSolanaExpiry`). An expiry with less proof is unverified: the
 * record can be released so sends are never blocked for good, but the
 * transaction may have landed. A signature seen only at `processed` may still
 * be dropped with its fork and land later, so it stays in flight. Lookup
 * failures keep a record in flight. In-flight transactions are rebroadcast
 * unchanged, which is idempotent and helps them land before they expire.
 */
export async function resolveSolanaPendingSends(
  records: SolanaPendingSend[],
  client: SolanaPendingSendClient,
  assertCurrent?: () => void,
  rebroadcast = true,
  now: () => number = Date.now
): Promise<{ resolved: SolanaPendingSend[]; unresolved: SolanaPendingSend[]; unverified: SolanaPendingSend[] }> {
  assertCurrent?.();
  if (!records.length) return { resolved: [], unresolved: [], unverified: [] };

  try {
    const resolutions = await client.resolveSignatures(
      records.map(({ lastValidBlockHeight, signature }) => ({ lastValidBlockHeight, signature }))
    );
    assertCurrent?.();
    const resolved: SolanaPendingSend[] = [];
    const unresolved: SolanaPendingSend[] = [];
    const unverified: SolanaPendingSend[] = [];
    const judgedAt = now();

    records.forEach((record, index) => {
      const resolution = resolutions[index];

      if (resolution?.state === 'landed') resolved.push(record);
      else if (resolution?.state === 'expired')
        (isCorroboratedSolanaExpiry(resolution.provingHosts, record.createdAt, judgedAt) ? resolved : unverified).push(record);
      else unresolved.push(record);
    });

    await Promise.all(
      (rebroadcast ? unresolved : []).map(async ({ transactionBase64 }) => {
        assertCurrent?.();
        try {
          await client.sendRawTransaction(transactionBase64, { maxRetries: 0, skipPreflight: true }, assertCurrent);
        } catch {
          assertCurrent?.();
        }
      })
    );

    return { resolved, unresolved, unverified };
  } catch {
    // A lookup/broadcast failure preserves evidence, but must not hide reset.
    assertCurrent?.();
    return { resolved: [], unresolved: records, unverified: [] };
  }
}

// Legacy records did not store a canonical sender. The signed message carries
// its fee payer; verify the envelope instead of trusting its old UI account ID.
export function legacySolanaPendingSender(record: SolanaPendingSend): string | undefined {
  try {
    const bytes = Uint8Array.from(atob(record.transactionBase64), char => char.charCodeAt(0));
    const parsed = parseSolanaSerializedTransaction(bytes);
    const signature = bytes.slice(parsed.signaturesOffset, parsed.signaturesOffset + 64);
    const sender = parsed.accountKeys[0];
    if (base58Encode(signature) !== record.signature || !ed25519.verify(signature, parsed.messageBytes, base58Decode(sender)))
      return undefined;
    return sender;
  } catch { return undefined; }
}
