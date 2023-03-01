import type { Meta, ReplacedMeta, AddressMeta } from '@/interfaces/common';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import { isProduction } from '@/consts/global';

function firstCharToUp(string: string) {
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
  const networkName = isProduction ? 'sora mainnet' : 'sora test';

  return network === networkName;
}

export { getReplacedMetaTyped, getAddressMetaTyped, getMetaTyped, firstCharToUp, isSora };
