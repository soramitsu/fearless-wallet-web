import type { Meta, ReplacedMeta, AddressMeta } from '@/interfaces/common';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import { SORA_NETWORK_NAME } from '@/consts/networks';

function firstCharToUp(string: string) {
  if (!string) return '';

  return `${string.charAt(0).toUpperCase()}${string.slice(1)}`;
}

function getMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as Meta;
}

function getAddressMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as AddressMeta;
}

function getReplacedMetaTyped(meta: KeyringPair$Meta) {
  return meta as unknown as ReplacedMeta;
}

function isSora(network: string) {
  return network === SORA_NETWORK_NAME;
}

export { getReplacedMetaTyped, getAddressMetaTyped, getMetaTyped, firstCharToUp, isSora };
