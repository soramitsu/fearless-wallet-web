import type { Meta, ReplacedMeta, AddressMeta } from '@/interfaces/common';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';

export function firstCharToUp(string: string) {
  return `${string.charAt(0).toUpperCase()}${string.slice(1)}`;
}

export function getMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as Meta;
}

export function getAddressMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as AddressMeta;
}

export function getReplacedMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as ReplacedMeta;
}

export function isExtension(): boolean {
  return chrome.extension !== undefined;
}
