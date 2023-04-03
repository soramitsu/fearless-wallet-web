import type { Meta, ReplacedMeta, AddressMeta } from '@/interfaces/common';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import { SORA_NETWORK_NAME } from '@/consts/networks';

const EMAIL_REGEXP =
  /^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@(([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{2,})$/iu;

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

function validatePhoneNumber(phoneNumber: string) {
  return phoneNumber.length === 10;
}

function validateEmail(email: string) {
  return EMAIL_REGEXP.test(email);
}

export {
  getReplacedMetaTyped,
  getAddressMetaTyped,
  getMetaTyped,
  firstCharToUp,
  isSora,
  validatePhoneNumber,
  validateEmail,
};
