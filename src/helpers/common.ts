import EmailValidator from 'email-validator';
import type { Meta, ReplacedMeta, AddressMeta } from '@/interfaces/common';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import { SORA_NETWORK_NAME } from '@/consts/networks';

const MIN_PHONE_LENGTH_WITH_CODE = 8;

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

function validatePhoneNumber(countryCode: string, phoneNumber: string) {
  const code = countryCode.replace('+', '');

  return !!(+code && phoneNumber && `${code}${phoneNumber}`.length >= MIN_PHONE_LENGTH_WITH_CODE);
}

function validateEmail(email: string) {
  return EmailValidator.validate(email);
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
