import EmailValidator from 'email-validator';
import { format, isToday, isThisYear, secondsToMilliseconds } from 'date-fns';
import { SORA_NETWORK_NAME, SORA_MAINNET, SORA_TEST } from '@/consts/sora';

const MIN_PHONE_LENGTH_WITH_CODE = 8;

function firstCharToUp(string: string, onlyFirstChat = true) {
  if (!string) return '';

  const end = onlyFirstChat ? string.slice(1).toLowerCase() : string.slice(1);

  return `${string.charAt(0).toUpperCase()}${end}`;
}

function isSora(network: string) {
  return network.toLowerCase() === SORA_MAINNET || network.toLowerCase() === SORA_TEST; // временный костыль для стейкинга

  // return network.toLowerCase() === SORA_NETWORK_NAME;
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

function getFormattedDate(timestamp: string | number, type: 's' | 'ms' = 's') {
  const date = type === 's' ? new Date(secondsToMilliseconds(+timestamp)) : +timestamp;

  if (isToday(date)) {
    return format(date, 'HH:mm');
  }

  if (isThisYear(date)) {
    return format(date, 'dd MMMM HH:mm');
  }

  return format(date, 'dd MMMM yyyy HH:mm');
}

export { firstCharToUp, isSora, validatePhoneNumber, validateEmail, cut, getClipboard, getFormattedDate };
