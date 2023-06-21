import EmailValidator from 'email-validator';
import type { Meta, AddressMeta } from '@/interfaces/common';
import type { KeyringPair$Meta } from '@polkadot/keyring/types';
import { SORA_NETWORK_NAME } from '@/consts/networks';

const MIN_PHONE_LENGTH_WITH_CODE = 8;

function firstCharToUp(string: string, onlyFirstChat = true) {
  if (!string) return '';

  const end = onlyFirstChat ? string.slice(1).toLowerCase() : string.slice(1);

  return `${string.charAt(0).toUpperCase()}${end}`;
}

function isSora(network: string) {
  return network.toLowerCase() === SORA_NETWORK_NAME;
}

function validatePhoneNumber(countryCode: string, phoneNumber: string) {
  const code = countryCode.replace('+', '');

  return !!(+code && phoneNumber && `${code}${phoneNumber}`.length >= MIN_PHONE_LENGTH_WITH_CODE);
}

function validateEmail(email: string) {
  return EmailValidator.validate(email);
}

function cut(value: string, length = 7) {
  const endNumber = length + 1;

  if (value.length <= length * 2 + 1) return value;

  return `${value.slice(0, length)}...${value.slice(-endNumber)}`;
}

function getClipboard() {
  const pasteTarget = document.createElement('div');

  pasteTarget.contentEditable = 'true';

  const actElem = document.activeElement?.appendChild(pasteTarget).parentNode;

  pasteTarget.focus();

  document.execCommand('paste');

  const paste = pasteTarget.textContent ?? '';

  actElem?.removeChild(pasteTarget);

  return paste;
}

export { firstCharToUp, isSora, validatePhoneNumber, validateEmail, cut, getClipboard };
