import EmailValidator from 'email-validator';
import { format, isToday, isThisYear, secondsToMilliseconds } from 'date-fns';
import { SORA_MAINNET, SORA_NETWORK_NAME, SORA_TEST } from '@/consts/sora';

const MIN_PHONE_LENGTH_WITH_CODE = 8;

function firstCharToUp(string: string, onlyFirstChat = true) {
  if (!string) return '';

  const end = onlyFirstChat ? string.slice(1).toLowerCase() : string.slice(1);

  return `${string.charAt(0).toUpperCase()}${end}`;
}

function isSameString(string1: string | undefined, string2: string | undefined) {
  if (string1 === undefined || string2 === undefined) return false;

  return string1.toLowerCase() === string2.toLowerCase();
}

function isSubstrString(string1: string, string2: string) {
  return string1.toLowerCase().includes(string2.toLowerCase());
}

function isSora(network: string, allSora = false) {
  // проверяем, что переданная сеть является СОРА сетью
  if (allSora) return isSameString(network, SORA_MAINNET) || isSameString(network, SORA_TEST);

  // проверяем, что переданная сеть является актуальной сора сетью для текущего энвайромента
  // для PROD - Sora Mainnet, для DEV - Sora Testnet
  return isSameString(network, SORA_NETWORK_NAME);
}

function isSoraTest(network: string) {
  return isSameString(network, SORA_TEST);
}

function validatePhoneNumber(countryCode: string, phoneNumber: string) {
  const code = countryCode.replace('+', '');

  return !!(+code && phoneNumber && `${code}${phoneNumber}`.length >= MIN_PHONE_LENGTH_WITH_CODE);
}

function validateEmail(email: string) {
  return EmailValidator.validate(email);
}

function cut(value: string | undefined, length = 7) {
  if (value === undefined) return '';

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

function getFormattedDate(timestamp: string | number, type: 's' | 'ms' = 's') {
  const date = type === 's' ? secondsToMilliseconds(+timestamp) : +timestamp;

  if (isToday(date)) {
    return format(date, 'HH:mm');
  }

  if (isThisYear(date)) {
    return format(date, 'dd MMMM HH:mm');
  }

  return format(date, 'dd MMMM yyyy HH:mm');
}

function isExtension() {
  return !!process.env.IS_EXTENSION;
}

export {
  firstCharToUp,
  isSora,
  isSameString,
  validatePhoneNumber,
  validateEmail,
  cut,
  getClipboard,
  getFormattedDate,
  isSoraTest,
  isSubstrString,
  isExtension,
};
