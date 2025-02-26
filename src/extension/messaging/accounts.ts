import type { FWKeyringMeta } from '@extension-base/types';
import type { KeypairType } from '@polkadot/util-crypto/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type {
  ValidateJsonResult,
  AccountJson,
  ResponseTotalBalances,
  ResponseAccountExport,
  ResponseExportSeed,
} from '@extension-base/background/types/types';
import type { DerivationPath, NetworkName, TonEventTokens } from '@/interfaces';
import type { WordCount } from '@extension-base/services';
import { WalletEcosystem } from '@/interfaces';
import { sendMessage } from '@/extension/messaging/index';

export function addAccount(
  suri: string,
  type: KeypairType,
  meta: FWKeyringMeta,
  walletEcosystem = WalletEcosystem.Substrate
): Promise<string> {
  return sendMessage('pri(accounts.create)', { suri, type, meta, walletEcosystem });
}

export function createMobileWallet(address: string, meta: FWKeyringMeta): Promise<boolean> {
  return sendMessage('pri(accounts.create.mobile)', { meta, address });
}

export function subscribeAccounts(cb: (accounts: AccountJson[]) => void): Promise<AccountJson[]> {
  return sendMessage('pri(accounts.subscribe)', null, cb);
}

export function exportJSON(address: string, password: string, network?: string): Promise<ResponseAccountExport> {
  return sendMessage('pri(accounts.export.json)', { address, password, network });
}

export function migrateExportJSON(address: string): Promise<ResponseAccountExport> {
  return sendMessage('pri(migrate.export.json)', address);
}

export function exportMnemonic(
  address: string,
  password: string,
  walletEcosystem?: WalletEcosystem
): Promise<ResponseExportSeed> {
  return sendMessage('pri(keyring.export.mnemonic)', { address, password, walletEcosystem });
}

export function exportRowSeed(address: string, password: string, isEVM: boolean): Promise<ResponseExportSeed> {
  return sendMessage('pri(keyring.export.rowSeed)', { address, password, isEVM });
}

export function generateMnemonic(
  walletEcosystem = WalletEcosystem.Substrate,
  wordCount: WordCount = 12
): Promise<string> {
  return sendMessage('pri(keyring.generateMnemonic)', { walletEcosystem, wordCount });
}

export function mnemonicValidate(walletEcosystem = WalletEcosystem.Substrate, seed: string): Promise<boolean> {
  return sendMessage('pri(keyring.mnemonicValidate)', { walletEcosystem, seed });
}

export function accountUpdateName(address: string, name: string, walletEcosystem: WalletEcosystem): Promise<boolean> {
  return sendMessage('pri(accounts.name)', { address, name, walletEcosystem });
}

export function forgetAccount(address: string, type: 'native' | 'mobile'): Promise<boolean> {
  return sendMessage('pri(accounts.forget)', { address, type });
}

export function validatePassword(password: string): Promise<boolean> {
  return sendMessage('pri(accounts.validate)', { password });
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

export function updateCurrentAccount(address: string, walletEcosystem = WalletEcosystem.Substrate): Promise<boolean> {
  return sendMessage('pri(accounts.update.current)', { address, walletEcosystem });
}

export function updatePairMeta(address: string, meta: Partial<FWKeyringMeta>): Promise<boolean> {
  return sendMessage('pri(accounts.update.meta)', { address, meta });
}

export function getTotalBalances(): Promise<ResponseTotalBalances[]> {
  return sendMessage('pri(accounts.totalBalances)', null);
}

export function getHistory(address: string, network: NetworkName): Promise<TonEventTokens> {
  return sendMessage('pri(accounts.getHistory)', { address, network });
}
