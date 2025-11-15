import EmailValidator from 'email-validator';
import { format, isToday, isThisYear, secondsToMilliseconds } from 'date-fns';
import type { NetworkName } from '@/interfaces';
import { SORA_MAINNET, SORA_NETWORK_NAME, SORA_TEST } from '@/consts/sora';
import { LIBERLAND, TON_MAINNET, TON_TESTNET } from '@/consts/networks';

const MIN_PHONE_LENGTH_WITH_CODE = 8;

function firstCharToUp(string: string, onlyFirstChat = true) {
  if (!string) return '';

  const end = onlyFirstChat ? string.slice(1).toLowerCase() : string.slice(1);

  return `${string.charAt(0).toUpperCase()}${end}`;
}

function isSameString(string1: string | undefined | null, value2: string | undefined | null | string[]) {
  if (string1 === undefined || value2 === undefined) return false;

  if (string1 === null || value2 === null) return false;

  const strint1Lower = string1.toLowerCase();

  if (Array.isArray(value2)) return value2.some((value) => value.toLowerCase() === strint1Lower);

  return strint1Lower === value2.toLowerCase();
}

function isSubstrString(string1: string, string2: string) {
  return string1.toLowerCase().includes(string2.toLowerCase());
}

function isSora(network?: NetworkName, allSora = false) {
  // проверяем, что переданная сеть является СОРА сетью
  if (allSora) return isSameString(network, SORA_MAINNET) || isSameString(network, SORA_TEST);

  // проверяем, что переданная сеть является актуальной сора сетью для текущего энвайромента
  // для PROD - Sora Mainnet, для DEV - Sora Testnet
  return isSameString(network, SORA_NETWORK_NAME);
}

function isLiberland(network: NetworkName) {
  return isSameString(network, LIBERLAND);
}

function isSoraTest(network: string) {
  return isSameString(network, SORA_TEST);
}

function isSoraMainnet(network: string) {
  return isSameString(network, SORA_MAINNET);
}

function isTonMainnet(network: string) {
  return isSameString(network, TON_MAINNET);
}

function isTonNetwork(network: string) {
  return isSameString(network, TON_MAINNET) || isSameString(network, TON_TESTNET);
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

function setClipboard(str: string) {
  if ('clipboard' in navigator) {
    const clipboard = (navigator as Navigator & { clipboard?: Clipboard }).clipboard;

    clipboard?.writeText(str);
  }
}

function getJettonAssetId(name: string, symbol: string) {
  return `${name.toLowerCase()} - ${symbol.toLowerCase()}`;
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

export {
  firstCharToUp,
  isSora,
  isSameString,
  validatePhoneNumber,
  validateEmail,
  cut,
  getJettonAssetId,
  getClipboard,
  setClipboard,
  getFormattedDate,
  isSoraTest,
  isSubstrString,
  isLiberland,
  isTonMainnet,
  isSoraMainnet,
  isTonNetwork,
};

export {
  isNetworkGroup,
  normalizeNetworkName,
  filterNetworksByGroup,
  NETWORK_GROUP_VALUES,
  filterNetworksBySelection,
  createNormalizedNetworkNameSet,
} from '@/helpers/networkGroups';
export { balanceMatchesNetwork, findBalanceByNetwork, findTokenBalanceByNetwork } from '@/helpers/balances';
