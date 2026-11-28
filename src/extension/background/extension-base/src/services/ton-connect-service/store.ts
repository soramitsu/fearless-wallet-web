import { EXTENSION_PREFIX } from '@extension-base/defaults';
import BaseExtensionStore from '@extension-base/stores/BaseExtension';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { readTonConnectManifest, type TonConnectManifest } from './manifest';
import { IS_EXTENSION } from '@/consts/global';
import { isTonConnectPageOrigin } from '@/util/tonConnect/protocol';

/**
 * A page the person connected over the TON Connect JS bridge. It holds no key: the bridge is not encrypted, and
 * what the page may do is bound to its origin, which the browser reports, and to one TON wallet.
 */
export type TonConnectSession = {
  origin: string;
  /** The TON keyring address the person chose for this page. */
  address: string;
  manifest: TonConnectManifest;
  connectedAt: number;
  /** The highest request id handled; the next must be greater. */
  lastRequestId?: string;
};

export type TonConnectSessionsRecord = {
  version: 1;
  sessions: Record<string, TonConnectSession>;
};

const KEY = 'sessions';

const empty = (): TonConnectSessionsRecord => ({ version: 1, sessions: {} });

function readSession(origin: string, value: unknown): TonConnectSession | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const session = value as Partial<TonConnectSession>;

  try {
    if (session.origin !== origin || !isTonConnectPageOrigin(origin)) return undefined;
    if (typeof session.address !== 'string' || session.address.length === 0 || session.address.length > 128) return undefined;
    if (typeof session.connectedAt !== 'number' || !Number.isFinite(session.connectedAt)) return undefined;
    if (session.lastRequestId !== undefined && (typeof session.lastRequestId !== 'string' || !/^\d{1,20}$/.test(session.lastRequestId)))
      return undefined;

    return {
      origin,
      address: session.address,
      manifest: readTonConnectManifest(session.manifest),
      connectedAt: session.connectedAt,
      ...(session.lastRequestId === undefined ? {} : { lastRequestId: session.lastRequestId }),
    };
  } catch {
    return undefined;
  }
}

/** A saved record that cannot be read connects nothing: each unreadable session is dropped, never guessed at. */
export function readTonConnectSessions(value: unknown): TonConnectSessionsRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty();

  const record = value as Partial<TonConnectSessionsRecord>;

  if (record.version !== 1 || !record.sessions || typeof record.sessions !== 'object') return empty();

  const sessions: Record<string, TonConnectSession> = {};

  Object.entries(record.sessions).forEach(([origin, session]) => {
    const read = readSession(origin, session);

    if (read) sessions[origin] = read;
  });

  return { version: 1, sessions };
}

export default class TonConnectStore extends (IS_EXTENSION ? BaseExtensionStore : BaseWebStore)<TonConnectSessionsRecord> {
  constructor() {
    super(`${EXTENSION_PREFIX}TonConnect`);
  }

  async readSessions(): Promise<TonConnectSessionsRecord> {
    return readTonConnectSessions(await super.getAndWait(KEY));
  }

  async mutateSessions(change: (record: TonConnectSessionsRecord) => void): Promise<TonConnectSessionsRecord> {
    return (await super.updateAndWait(KEY, (current) => {
      const record = readTonConnectSessions(current);

      change(record);

      return record;
    }))!;
  }
}
