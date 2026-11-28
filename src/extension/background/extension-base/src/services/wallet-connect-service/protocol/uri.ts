// WalletConnect v2 pairing links: wc:<topic>@2?relay-protocol=irn&symKey=<key>[&expiryTimestamp=<seconds>][&methods=...]

import { getInternalError } from './errors';
import { isHexKey } from './crypto';
import type { WcRelay } from './types';

export type PairingUri = {
  topic: string;
  version: number;
  symKey: string;
  relay: WcRelay;
  expiryTimestamp?: number;
  methods?: string[];
};

const MAX_URI_LENGTH = 4096;

const invalid = (detail: string) => new Error(`${getInternalError('MISSING_OR_INVALID').message} ${detail}`);

/**
 * Reads a pairing link. A version 1 link throws UNKNOWN_TYPE (that protocol is gone); anything else malformed throws
 * MISSING_OR_INVALID.
 */
export function parsePairingUri(input: string): PairingUri {
  if (typeof input !== 'string' || input.length > MAX_URI_LENGTH) throw invalid('pairing link');
  const uri = input.trim();
  const match = /^wc:(?:\/\/)?([^@?]+)@([0-9]+)(?:\?(.*))?$/.exec(uri);

  if (!match) throw invalid('pairing link');
  const version = Number(match[2]);

  if (version === 1) throw new Error(getInternalError('UNKNOWN_TYPE').message);
  if (version !== 2) throw invalid('pairing link version');
  const topic = match[1].toLowerCase();

  if (!isHexKey(topic)) throw invalid('pairing topic');
  const query = new URLSearchParams(match[3] ?? '');
  const symKey = (query.get('symKey') ?? '').toLowerCase();

  if (!isHexKey(symKey)) throw invalid('pairing key');
  const protocol = query.get('relay-protocol') ?? 'irn';

  if (protocol !== 'irn') throw invalid('relay protocol');
  const relay: WcRelay = { protocol };
  const data = query.get('relay-data');

  if (data) relay.data = data;
  const result: PairingUri = { topic, version, symKey, relay };
  const expiry = query.get('expiryTimestamp');

  if (expiry !== null) {
    if (!/^[0-9]{1,12}$/.test(expiry)) throw invalid('pairing expiry');
    result.expiryTimestamp = Number(expiry);
  }
  const methods = query.get('methods');

  if (methods) result.methods = methods.split(',').slice(0, 32);

  return result;
}

/** A pairing link, with its parameters in the alphabetical order other implementations write. */
export function formatPairingUri(params: Omit<PairingUri, 'version'>): string {
  const entries: [string, string][] = [['relay-protocol', params.relay.protocol], ['symKey', params.symKey]];

  if (params.relay.data) entries.push(['relay-data', params.relay.data]);
  if (params.expiryTimestamp !== undefined) entries.push(['expiryTimestamp', String(params.expiryTimestamp)]);
  if (params.methods?.length) entries.push(['methods', params.methods.join(',')]);
  entries.sort(([a], [b]) => a.localeCompare(b));
  const query = new URLSearchParams(entries);

  return `wc:${params.topic}@2?${query.toString()}`;
}
