// What the WalletConnect client keeps across worker restarts: keys, pairings, sessions, proposals and requests
// in flight. It is one record, written whole, so a restart never sees half of a change.

import { isHexKey, randomKey } from './crypto';
import type { WcPairing, WcProposal, WcSession } from './types';

export const WALLET_CONNECT_RECORD = 'fearless:walletconnect:v1';

/** The records WalletConnect SDK 2.x kept. They are read once, when this client first starts, and left in place. */
export const SDK_KEYCHAIN = 'wc@2:core:0.3//keychain';
export const SDK_SESSIONS = 'wc@2:client:0.3//session';
export const SDK_PAIRINGS = 'wc@2:core:0.3//pairing';
export const SDK_RECORDS = [
  SDK_SESSIONS,
  'wc@2:client:0.3//proposal',
  SDK_PAIRINGS,
  'wc@2:core:0.3//subscription',
  'wc@2:core:0.3//history',
];

export interface KeyValueStorage {
  getItem<T = unknown>(key: string): Promise<T | undefined>;
  setItem<T = unknown>(key: string, value: T): Promise<void>;
}

/** A proposal Fearless sent as a dApp (mobile pairing), until the wallet answers and settles. */
export type SentProposal = {
  proposal: WcProposal;
  /** The session topic once the wallet answered, until it settles. */
  settlementTopic?: string;
  responderPublicKey?: string;
};

/** A session request a dApp sent to Fearless, until Fearless answers or it expires. */
export type ReceivedRequest = { id: number; topic: string; expiryTimestamp: number };

export type WalletConnectRecord = {
  version: 1;
  /** The relay identity (Ed25519 seed), hex. */
  clientSeed: string;
  /** Symmetric keys by topic and X25519 private keys by public key, hex. */
  keys: Record<string, string>;
  pairings: WcPairing[];
  sessions: WcSession[];
  /** Proposals dApps sent to Fearless, awaiting the person's decision. */
  proposals: WcProposal[];
  sentProposals: SentProposal[];
  requests: ReceivedRequest[];
  /** The settlement request Fearless sent for a session it approved, by topic, until the dApp acknowledges it. */
  settlements: Record<string, number>;
  /** Hashes of handled messages and when, so a redelivered message is not handled twice. */
  seen: [string, number][];
  migratedFromSdk?: boolean;
};

export const emptyRecord = (): WalletConnectRecord => ({
  version: 1,
  clientSeed: randomKey(),
  keys: {},
  pairings: [],
  sessions: [],
  proposals: [],
  sentProposals: [],
  requests: [],
  settlements: {},
  seen: [],
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isParticipant = (value: unknown): boolean =>
  isObject(value) && isHexKey(value.publicKey) && isObject(value.metadata) && typeof value.metadata.url === 'string';

/** A stored or imported session that is complete and keyed. An expired one is kept, so the client reports it. */
export function isUsableSession(value: unknown, keys: Record<string, string>): value is WcSession {
  return (
    isObject(value) &&
    isHexKey(value.topic) &&
    isHexKey(keys[value.topic as string]) &&
    typeof value.expiry === 'number' &&
    Number.isFinite(value.expiry) &&
    typeof value.acknowledged === 'boolean' &&
    isHexKey(value.controller) &&
    isObject(value.namespaces) &&
    isParticipant(value.self) &&
    isParticipant(value.peer)
  );
}

const isUsablePairing = (value: unknown, keys: Record<string, string>): value is WcPairing =>
  isObject(value) &&
  isHexKey(value.topic) &&
  isHexKey(keys[value.topic as string]) &&
  typeof value.expiry === 'number' &&
  Number.isFinite(value.expiry) &&
  typeof value.active === 'boolean';

function normalize(value: unknown): WalletConnectRecord | undefined {
  if (!isObject(value) || value.version !== 1 || !isHexKey(value.clientSeed) || !isObject(value.keys)) return undefined;
  const record = { ...emptyRecord(), ...value } as WalletConnectRecord;

  for (const field of ['pairings', 'sessions', 'proposals', 'sentProposals', 'requests', 'seen'] as const)
    if (!Array.isArray(record[field])) (record as Record<string, unknown>)[field] = [];
  if (!isObject(record.settlements)) record.settlements = {};

  return record;
}

/** Sessions and pairings SDK 2.x saved, with the keys they need. Proposals and requests in flight are not kept. */
async function importSdkRecords(storage: KeyValueStorage): Promise<WalletConnectRecord | undefined> {
  const [keychain, sessions, pairings] = await Promise.all([
    storage.getItem<unknown>(SDK_KEYCHAIN),
    storage.getItem<unknown>(SDK_SESSIONS),
    storage.getItem<unknown>(SDK_PAIRINGS),
  ]);

  if (!isObject(keychain) && !Array.isArray(sessions) && !Array.isArray(pairings)) return undefined;
  const record = emptyRecord();
  const sdkKeys = isObject(keychain) ? keychain : {};
  const seed = sdkKeys.client_ed25519_seed;

  // The same relay identity, so the relay treats this client as the one that subscribed.
  if (isHexKey(seed)) record.clientSeed = seed;
  const keyFor = (topic: string) => (isHexKey(sdkKeys[topic]) ? (sdkKeys[topic] as string) : undefined);

  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (!isObject(session) || !isHexKey(session.topic)) continue;
    const key = keyFor(session.topic);

    if (!key) continue;
    if (!isUsableSession(session, { [session.topic]: key })) continue;
    record.keys[session.topic] = key;
    record.sessions.push(structuredClone(session) as WcSession);
  }
  for (const pairing of Array.isArray(pairings) ? pairings : []) {
    if (!isObject(pairing) || !isHexKey(pairing.topic)) continue;
    const key = keyFor(pairing.topic);

    if (!key || !isUsablePairing(pairing, { [pairing.topic]: key })) continue;
    record.keys[pairing.topic] = key;
    record.pairings.push({
      topic: pairing.topic,
      expiry: pairing.expiry,
      relay: isObject(pairing.relay) && typeof pairing.relay.protocol === 'string' ? { protocol: pairing.relay.protocol } : { protocol: 'irn' },
      active: pairing.active,
      ...(isObject(pairing.peerMetadata) ? { peerMetadata: pairing.peerMetadata as WcPairing['peerMetadata'] } : {}),
    } as WcPairing);
  }
  record.migratedFromSdk = true;

  return record;
}

export class WalletConnectStore {
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<WalletConnectRecord> {
    const stored = normalize(await this.storage.getItem<unknown>(WALLET_CONNECT_RECORD));

    if (stored) {
      stored.sessions = stored.sessions.filter((session) => isUsableSession(session, stored.keys));
      stored.pairings = stored.pairings.filter((pairing) => isUsablePairing(pairing, stored.keys));
      return stored;
    }
    const imported = await importSdkRecords(this.storage);
    const record = imported ?? emptyRecord();

    await this.save(record);

    return record;
  }

  /** Writes the whole record; writes happen in the order they were asked for. */
  save(record: WalletConnectRecord): Promise<void> {
    const snapshot = structuredClone(record);
    const write = this.writing.then(() => this.storage.setItem(WALLET_CONNECT_RECORD, snapshot));

    this.writing = write.catch(() => undefined);

    return write;
  }
}

/** Whether a client has anything to restore: this client's own sessions, pairings or proposals, or SDK 2.x records. */
export async function hasStoredWalletConnectData(storage: KeyValueStorage): Promise<boolean> {
  const own = normalize(await storage.getItem<unknown>(WALLET_CONNECT_RECORD));

  if (own) return !!(own.sessions.length || own.pairings.length || own.proposals.length || own.sentProposals.length);
  const records = await Promise.all(SDK_RECORDS.map((key) => storage.getItem<unknown[]>(key)));

  return records.some((record) => Array.isArray(record) && record.length > 0);
}
