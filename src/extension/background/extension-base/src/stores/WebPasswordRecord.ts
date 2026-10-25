import { EXTENSION_PREFIX } from '../defaults';
import BaseWebStore from './BaseWeb';
import type { KeyringPasswordJson } from '@subwallet/keyring/types';
import { requestWebPasswordStorage } from '@/bootstrap/webPasswordStore';

export const WEB_PASSWORD_RECORD_KEY = 'webPasswordRecord';
export const WEB_RESET_PASSWORD_KEY = 'pendingResetPassword';
export type WebPasswordRecord = { version: 1; serialized: string | null };
export class WebPasswordStore extends BaseWebStore<unknown> {
  constructor() { super(EXTENSION_PREFIX); }
  // Only migration may repair missing authority in recovery mode. Ordinary
  // password writes separately assert writability in KeyringStoreWeb.
  protected assertWritable(): void {}
}

export function decodeWebPassword(serialized: string | null): KeyringPasswordJson | null {
  if (serialized === null) return null;
  const value = JSON.parse(serialized) as KeyringPasswordJson | null;
  if (!value || typeof value.passwordHash !== 'string') throw new Error('Invalid wallet password record.');
  return value;
}

export function validateWebPasswordRecord(value: unknown): WebPasswordRecord {
  const record = value as WebPasswordRecord | undefined;
  if (!record || record.version !== 1 || (record.serialized !== null && typeof record.serialized !== 'string'))
    throw new Error('Invalid wallet password storage.');
  decodeWebPassword(record.serialized);
  return record;
}

// Presence, including a null tombstone, wins over every legacy copy. Never infer
// absence after a failed database read or replace a newer record during migration.
export async function loadWebPasswordRecord(): Promise<{ record: WebPasswordRecord; persisted: boolean }> {
  const store = new WebPasswordStore();
  const stored = await store.getAndWait(WEB_PASSWORD_RECORD_KEY);
  if (stored !== undefined) return { record: validateWebPasswordRecord(stored), persisted: true };
  const journal = await store.getAndWait(WEB_RESET_PASSWORD_KEY) as { serialized?: unknown } | undefined;
  let serialized: string | null;
  try {
    serialized = await requestWebPasswordStorage('get');
  } catch (error) {
    // A retained journal can permit authenticated emergency export, but cannot
    // be promoted while the window might contain a newer password record.
    if (typeof journal?.serialized !== 'string') throw error;
    decodeWebPassword(journal.serialized);
    return { record: { version: 1, serialized: journal.serialized }, persisted: false };
  }
  if (serialized === null && journal) {
    if (journal.serialized !== null && typeof journal.serialized !== 'string')
      throw new Error('Invalid pending password reset recovery.');
    serialized = typeof journal.serialized === 'string' ? journal.serialized : null;
  }
  const candidate = validateWebPasswordRecord({ version: 1, serialized });
  let foundConcurrentRecord = false;
  let concurrentRecord: WebPasswordRecord | undefined;
  try {
    const record = await store.updateAndWait(WEB_PASSWORD_RECORD_KEY,
      (current) => {
        if (current === undefined) return candidate;
        foundConcurrentRecord = true;
        concurrentRecord = validateWebPasswordRecord(current);
        return undefined;
      }, undefined, false);
    return { record: concurrentRecord ?? validateWebPasswordRecord(record), persisted: true };
  } catch (error) {
    if (foundConcurrentRecord) throw error;
    // Keep the readable legacy state available; mutations require a successful
    // migration on a later startup. Neither recovery copy is changed here.
    return { record: candidate, persisted: false };
  }
}
