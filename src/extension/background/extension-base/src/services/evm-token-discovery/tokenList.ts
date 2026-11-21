import { getAddress } from 'ethers';

/** A token of a network's list (remote-config/production/tokens/evm/v1, docs/evm-token-discovery.md). */
export interface EvmListedToken {
  /** The checksummed contract address. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const EVM_TOKEN_LIST_FORMAT = 'fearless-evm-token-list';
export const EVM_TOKEN_LIST_INDEX_FORMAT = 'fearless-evm-token-lists';
export const EVM_TOKEN_LIST_VERSION = 1;
export const MAX_LISTED_TOKENS = 5000;
export const MAX_SYMBOL_LENGTH = 24;
export const MAX_NAME_LENGTH = 64;
export const MAX_DECIMALS = 36;

// Control characters, zero-width and bidirectional formatting characters: a symbol must read as what it is.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/gu;

/** Printable text of at most `max` characters, or '' when nothing printable is left. */
export function sanitizeTokenText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';

  const text = value.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();

  return [...text].slice(0, max).join('').trim();
}

/** The checksummed address, or undefined for anything that is not a 20-byte hex address. */
export function checksumEvmAddress(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/u.test(value)) return undefined;

  try {
    return getAddress(value.toLowerCase());
  } catch {
    return undefined;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The tokens of a network's list. The list is fetched unsigned, so it is read fail-closed: a document of another
 * format, version or chain is refused, a malformed entry is left out, a repeated address counts once and nothing past
 * MAX_LISTED_TOKENS is read.
 */
export function parseEvmTokenList(document: unknown, chainId: string): EvmListedToken[] {
  if (!isRecord(document) || document.format !== EVM_TOKEN_LIST_FORMAT || document.version !== EVM_TOKEN_LIST_VERSION) {
    throw new Error('evm_token_list_format');
  }
  if (String(document.chainId) !== chainId) throw new Error('evm_token_list_chain');
  if (!Array.isArray(document.tokens)) throw new Error('evm_token_list_format');

  const tokens = new Map<string, EvmListedToken>();

  for (const entry of document.tokens.slice(0, MAX_LISTED_TOKENS)) {
    if (!Array.isArray(entry)) continue;

    const [rawAddress, rawSymbol, rawName, decimals] = entry as unknown[];
    const address = checksumEvmAddress(rawAddress);
    const symbol = sanitizeTokenText(rawSymbol, MAX_SYMBOL_LENGTH);
    const name = sanitizeTokenText(rawName, MAX_NAME_LENGTH) || symbol;

    if (!address || !symbol || typeof decimals !== 'number' || !Number.isInteger(decimals)) continue;
    if (decimals < 0 || decimals > MAX_DECIMALS || tokens.has(address.toLowerCase())) continue;

    tokens.set(address.toLowerCase(), { address, symbol, name, decimals });
  }

  return [...tokens.values()];
}

/** The chain ids that have a list, from `index.json`. A chain it does not name has no list to fetch. */
export function parseEvmTokenListIndex(document: unknown): Set<string> {
  if (
    !isRecord(document) ||
    document.format !== EVM_TOKEN_LIST_INDEX_FORMAT ||
    document.version !== EVM_TOKEN_LIST_VERSION ||
    !isRecord(document.lists)
  ) {
    throw new Error('evm_token_list_index_format');
  }

  return new Set(Object.keys(document.lists).filter((chainId) => /^\d+$/u.test(chainId)));
}
