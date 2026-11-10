// Reads what peers send. Everything from the relay is untrusted: anything malformed or oversized is refused, never
// repaired, and nothing beyond the protocol's fields is kept.

import { isHexKey } from './crypto';
import type {
  WcMetadata,
  WcProposalNamespace,
  WcProposalNamespaces,
  WcRelay,
  WcSessionNamespace,
  WcSessionNamespaces,
} from './types';

const MAX_NAMESPACES = 32;
const MAX_ITEMS = 512;
const MAX_ITEM_LENGTH = 512;
const MAX_URL_LENGTH = 2048;
const MAX_PROPERTIES = 32;
const MAX_PROPERTY_LENGTH = 8192;

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A CAIP-2 chain id, `namespace:reference`. */
export const isChainId = (value: unknown): value is string =>
  typeof value === 'string' && /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,64}$/.test(value);

/** A CAIP-10 account id, `namespace:reference:address`. */
export const isAccountId = (value: unknown): value is string =>
  typeof value === 'string' && /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,64}:[-.%a-zA-Z0-9]{1,128}$/.test(value);

/** A namespace key is a namespace (`eip155`) or one chain of it (`eip155:1`). */
const isNamespaceKey = (value: string): boolean => /^[-a-z0-9]{3,8}$/.test(value) || isChainId(value);

function strings(value: unknown, check: (item: string) => boolean = () => true): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return undefined;
  if (!value.every((item) => typeof item === 'string' && item.length <= MAX_ITEM_LENGTH && check(item))) return undefined;

  return [...value];
}

export function readMetadata(value: unknown): WcMetadata | undefined {
  if (!isObject(value)) return undefined;
  const { name, description, url, icons } = value;

  if (typeof name !== 'string' || name.length > 256) return undefined;
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) return undefined;
  if (description !== undefined && (typeof description !== 'string' || description.length > 4096)) return undefined;
  const iconList = icons === undefined ? [] : icons;

  if (!Array.isArray(iconList) || iconList.length > 16) return undefined;
  if (!iconList.every((icon) => typeof icon === 'string' && icon.length <= MAX_URL_LENGTH)) return undefined;
  const metadata: WcMetadata = { name, description: typeof description === 'string' ? description : '', url, icons: [...iconList] };

  if (typeof value.verifyUrl === 'string' && value.verifyUrl.length <= MAX_URL_LENGTH) metadata.verifyUrl = value.verifyUrl;
  if (isObject(value.redirect)) {
    const redirect: NonNullable<WcMetadata['redirect']> = {};

    if (typeof value.redirect.native === 'string' && value.redirect.native.length <= MAX_URL_LENGTH)
      redirect.native = value.redirect.native;
    if (typeof value.redirect.universal === 'string' && value.redirect.universal.length <= MAX_URL_LENGTH)
      redirect.universal = value.redirect.universal;
    if (typeof value.redirect.linkMode === 'boolean') redirect.linkMode = value.redirect.linkMode;
    metadata.redirect = redirect;
  }

  return metadata;
}

export function readParticipant(value: unknown): { publicKey: string; metadata: WcMetadata } | undefined {
  if (!isObject(value) || !isHexKey(value.publicKey)) return undefined;
  const metadata = readMetadata(value.metadata);

  return metadata ? { publicKey: value.publicKey, metadata } : undefined;
}

export function readRelay(value: unknown): WcRelay | undefined {
  if (!isObject(value) || typeof value.protocol !== 'string' || value.protocol.length > 64) return undefined;

  return typeof value.data === 'string' && value.data.length <= MAX_ITEM_LENGTH
    ? { protocol: value.protocol, data: value.data }
    : { protocol: value.protocol };
}

export function readProposalNamespaces(value: unknown): WcProposalNamespaces | undefined {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);

  if (entries.length > MAX_NAMESPACES) return undefined;
  const result: WcProposalNamespaces = {};

  for (const [key, namespace] of entries) {
    if (!isNamespaceKey(key) || !isObject(namespace)) return undefined;
    const methods = strings(namespace.methods);
    const events = strings(namespace.events);

    if (!methods || !events) return undefined;
    const entry: WcProposalNamespace = { methods, events };

    if (namespace.chains !== undefined) {
      const chains = strings(namespace.chains, isChainId);

      if (!chains) return undefined;
      entry.chains = chains;
    }
    result[key] = entry;
  }

  return result;
}

export function readSessionNamespaces(value: unknown): WcSessionNamespaces | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);

  if (!entries.length || entries.length > MAX_NAMESPACES) return undefined;
  const result: WcSessionNamespaces = {};

  for (const [key, namespace] of entries) {
    if (!isNamespaceKey(key) || !isObject(namespace)) return undefined;
    const accounts = strings(namespace.accounts, isAccountId);
    const methods = strings(namespace.methods);
    const events = strings(namespace.events);

    if (!accounts || !methods || !events) return undefined;
    const entry: WcSessionNamespace = { accounts, methods, events };

    if (namespace.chains !== undefined) {
      const chains = strings(namespace.chains, isChainId);

      if (!chains) return undefined;
      entry.chains = chains;
    }
    result[key] = entry;
  }

  return result;
}

export function readProperties(value: unknown): Record<string, string> | undefined | false {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) return false;
  const entries = Object.entries(value);

  if (entries.length > MAX_PROPERTIES) return false;
  if (!entries.every(([key, item]) => key.length <= 256 && typeof item === 'string' && item.length <= MAX_PROPERTY_LENGTH))
    return false;

  return Object.fromEntries(entries) as Record<string, string>;
}

/** Whether the granted namespaces cover everything a proposal required: each required chain, method and event. */
export function coversRequired(required: WcProposalNamespaces, granted: WcSessionNamespaces): boolean {
  return Object.entries(required).every(([key, need]) => {
    const grant = granted[key] ?? (isChainId(key) ? granted[key.split(':')[0]] : undefined);

    if (!grant) return false;
    const chains = need.chains ?? (isChainId(key) ? [key] : []);
    const grantedChains = new Set([...(grant.chains ?? []), ...grant.accounts.map((account) => account.split(':').slice(0, 2).join(':'))]);

    return (
      chains.every((chain) => grantedChains.has(chain)) &&
      need.methods.every((method) => grant.methods.includes(method)) &&
      need.events.every((event) => grant.events.includes(event))
    );
  });
}
