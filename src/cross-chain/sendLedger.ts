/**
 * Remembers cross-chain sends whose outcome is not known yet, so that the same route is not sent again from the same
 * account while the first extrinsic can still be included.
 *
 * A record is written after signing and before the extrinsic leaves the wallet, and removed once the outcome is known.
 * It survives a restart of the background worker. A record is resolved from the origin chain:
 *
 * - the account nonce moved past the recorded nonce: the extrinsic was included, or another one took its place, so it
 *   can never be included any more. The user is told once, with the hash, and the record is removed;
 * - the nonce did not move and the chain is past the extrinsic's mortality: it can never be included, nothing was sent;
 * - otherwise it may still be included, and the route stays blocked for that account.
 *
 * Failing to read the chain keeps the route blocked.
 */

export type CrossChainSendRecord = {
  address: string;
  routeId: string;
  originNet: string;
  /** Nonce the extrinsic was signed with. */
  nonce: number;
  /** Extrinsic hash, 64 lowercase hex characters without 0x. */
  hash: string;
  /** First block number at which the extrinsic can no longer be included, or null when it is immortal. */
  expiresAtBlock: number | null;
  recordedAt: number;
};

export type CrossChainSendRecords = Record<string, CrossChainSendRecord>;

export type CrossChainSendRecordStore = {
  load: () => Promise<unknown>;
  save: (records: CrossChainSendRecords) => Promise<void>;
};

export type CrossChainSendResolutionApi = {
  query: { system: { account: (address: string) => Promise<{ nonce: { toNumber: () => number } }> } };
  rpc: { chain: { getHeader: () => Promise<{ number: { toNumber: () => number } }> } };
};

export type PreviousCrossChainSend =
  | { state: 'none' }
  /** The extrinsic may still be included. */
  | { state: 'pending'; record: CrossChainSendRecord }
  /** The nonce was used: the extrinsic was included or replaced and is final. */
  | { state: 'consumed'; record: CrossChainSendRecord };

export class CrossChainPreviousSendUnresolvedError extends Error {
  constructor(readonly transactionHash: string) {
    super('cross_chain_previous_send_unresolved');
    this.name = 'CrossChainPreviousSendUnresolvedError';
  }
}

/** Mortal records are long past any polkadot-js mortality period after this; drop them instead of keeping them forever. */
const MORTAL_RECORD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const HASH = /^[0-9a-f]{64}$/;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBlockNumber = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function crossChainSendRecordKey(address: string, routeId: string): string {
  return JSON.stringify([address, routeId]);
}

function parseRecord(key: string, value: unknown): CrossChainSendRecord | null {
  if (!isRecordObject(value)) return null;

  const { address, routeId, originNet, nonce, hash, recordedAt, expiresAtBlock: expiry } = value;
  let expiresAtBlock: number | null;
  if (expiry === null) expiresAtBlock = null;
  else if (isBlockNumber(expiry)) expiresAtBlock = expiry;
  else return null;

  if (
    typeof address !== 'string' ||
    !address ||
    typeof routeId !== 'string' ||
    !routeId ||
    typeof originNet !== 'string' ||
    !originNet ||
    !isBlockNumber(nonce) ||
    typeof hash !== 'string' ||
    !HASH.test(hash) ||
    !isBlockNumber(recordedAt) ||
    crossChainSendRecordKey(address, routeId) !== key
  ) {
    return null;
  }

  return { address, routeId, originNet, nonce, hash, expiresAtBlock, recordedAt };
}

export class CrossChainSendLedger {
  private readonly sending = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: CrossChainSendRecordStore,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Claims the account for one send at a time. The returned function releases it and may be called more than once. */
  beginSend(address: string): () => void {
    if (this.sending.has(address)) throw new Error('cross_chain_send_in_progress');
    this.sending.add(address);

    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.sending.delete(address);
    };
  }

  isSending(address: string): boolean {
    return this.sending.has(address);
  }

  async inspect(address: string, routeId: string, api: CrossChainSendResolutionApi): Promise<PreviousCrossChainSend> {
    const record = (await this.serialized(() => this.read()))[crossChainSendRecordKey(address, routeId)];
    if (!record) return { state: 'none' };

    try {
      // Read the head before the nonce: a nonce read at that head or later covers every block up to it.
      const head = (await api.rpc.chain.getHeader()).number.toNumber();
      const nonce = (await api.query.system.account(record.address)).nonce.toNumber();
      if (!isBlockNumber(head) || !isBlockNumber(nonce)) return { state: 'pending', record };

      if (nonce > record.nonce) return { state: 'consumed', record };
      if (record.expiresAtBlock !== null && head >= record.expiresAtBlock) {
        await this.clear(record.address, record.routeId, record.hash);

        return { state: 'none' };
      }
    } catch {
      // Keep the route blocked until the chain can be read.
    }

    return { state: 'pending', record };
  }

  /** Writes the record before the extrinsic is sent. A failure here must stop the send. */
  record(record: CrossChainSendRecord): Promise<void> {
    const key = crossChainSendRecordKey(record.address, record.routeId);
    if (parseRecord(key, record) === null) return Promise.reject(new Error('cross_chain_send_record_invalid'));

    return this.serialized(async () => {
      const records = await this.read();
      await this.store.save({ ...records, [key]: { ...record } });
    });
  }

  /** Removes the record of this exact extrinsic. A newer record for the same route is kept. */
  clear(address: string, routeId: string, hash: string): Promise<void> {
    const key = crossChainSendRecordKey(address, routeId);

    return this.serialized(async () => {
      const records = await this.read();
      if (records[key]?.hash !== hash) return;

      const { [key]: _removed, ...rest } = records;
      await this.store.save(rest);
    });
  }

  private async read(): Promise<CrossChainSendRecords> {
    const stored = await this.store.load();
    const records: CrossChainSendRecords = {};
    if (!isRecordObject(stored)) return records;

    const oldest = this.now() - MORTAL_RECORD_RETENTION_MS;
    for (const [key, value] of Object.entries(stored)) {
      const record = parseRecord(key, value);
      if (!record) {
        console.warn('Ignoring a malformed cross-chain send record');
        continue;
      }
      if (record.expiresAtBlock !== null && record.recordedAt < oldest) continue;
      records[key] = record;
    }

    return records;
  }

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);

    return result;
  }
}
