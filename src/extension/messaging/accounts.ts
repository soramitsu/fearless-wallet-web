import type { KeypairType } from '@polkadot/util-crypto/types';
import type { KeyringPair$Meta, KeyringPair$Json } from '@polkadot/keyring/types';
import type {
  ValidateJsonResult,
  AccountJson,
  ResponseTotalBalances,
  Meta,
} from '@extension-base/background/types/types';
import type { DerivationPath } from '@/interfaces';
import { sendMessage } from '@/extension/messaging/index';

export function addAccount(
  password: string,
  suri: string,
  type?: KeypairType,
  meta?: Record<string, unknown>
): Promise<string> {
  return sendMessage('pri(accounts.create)', { password, suri, type, meta });
}

export function createMobileWallet(address: string, meta: KeyringPair$Meta): Promise<boolean> {
  return sendMessage('pri(accounts.create.mobile)', { meta, address });
}

export function subscribeAccounts(cb: (accounts: AccountJson[]) => void): Promise<AccountJson[]> {
  return sendMessage('pri(accounts.subscribe)', null, cb);
}

export function subscribeAddresses(cb: (accounts: AccountJson[]) => void): Promise<AccountJson[]> {
  return sendMessage('pri(addresses.subscribe)', null, cb);
}

export function exportAccount(address: string, password: string): Promise<{ exportedJson: KeyringPair$Json }> {
  return sendMessage('pri(accounts.export)', { address, password });
}

export function accountUpdateName(address: string, name: string): Promise<boolean> {
  return sendMessage('pri(accounts.name)', { address, name });
}

export function forgetAccount(address: string, type: 'native' | 'mobile'): Promise<boolean> {
  return sendMessage('pri(accounts.forget)', { address, type });
}

export function validatePassword(address: string, password: string): Promise<boolean> {
  return sendMessage('pri(accounts.validate)', { address, password });
}

export function jsonRestore(file: KeyringPair$Json, password: string): Promise<string> {
  return sendMessage('pri(accounts.json.restore)', { file, password });
}

export function isJsonValid(file: KeyringPair$Json, password: string, isSubstrate = true): Promise<ValidateJsonResult> {
  return sendMessage('pri(accounts.json.valid)', { file, password, isSubstrate });
}

export function isDerivationPathValid(request: DerivationPath): Promise<boolean> {
  return sendMessage('pri(accounts.validate.path)', request);
}

export function updateCurrentNetwork(type: string): Promise<boolean> {
  return sendMessage('pri(accounts.update.currentNetwork)', type);
}

export function updateCurrentAccount(address: string): Promise<boolean> {
  return sendMessage('pri(accounts.update.current)', address);
}

export function updatePairMeta(address: string, meta: Meta): Promise<boolean> {
  return sendMessage('pri(accounts.update.meta)', { address, meta });
}

export function getTotalBalances(): Promise<ResponseTotalBalances[]> {
  return sendMessage('pri(accounts.totalBalances)', null);
}
