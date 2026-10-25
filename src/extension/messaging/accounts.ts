import type { RecoveryRecordSummary } from '@extension-base/stores/WalletRecoveryRecords';
import type { FWKeyringMeta } from '@extension-base/types';
import type { KeypairType } from '@subwallet/keyring/types';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type {
  ValidateJsonResult,
  AccountJson,
  DeletedWalletSummary,
  ResponseRestoreDeletedWallet,
  RequestTotalBalances,
  ResponseTotalBalances,
  RequestPortfolioHoldings,
  ResponsePortfolioHoldings,
  ResponseAccountExport,
  ResponseExportSeed,
  TonImportCandidateInfo,
} from '@extension-base/background/types/types';
import type { DerivationPath, NetworkName, TonEventTokens } from '@/interfaces';
import type { WordCount } from '@extension-base/services';
import type { TonImportChoice } from '@/util/tonKeyring';
import { WalletEcosystem } from '@/interfaces';
import { UNIVERSAL_WALLET_DEFAULT_WORD_COUNT } from '@/consts/universalWallet';
import { sendMessage } from '@/extension/messaging/index';

export function addAccount(
  suri: string,
  type: KeypairType,
  meta: FWKeyringMeta,
  walletEcosystem = WalletEcosystem.Substrate,
  tonImport?: TonImportChoice,
  requireFreshGeneration = false
): Promise<string> {
  return sendMessage('pri(accounts.create)', { suri, type, meta, walletEcosystem, tonImport, requireFreshGeneration });
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
  wordCount: WordCount = UNIVERSAL_WALLET_DEFAULT_WORD_COUNT
): Promise<string> {
  return sendMessage('pri(keyring.generateMnemonic)', { walletEcosystem, wordCount });
}

export function mnemonicValidate(walletEcosystem = WalletEcosystem.Substrate, seed: string): Promise<boolean> {
  return sendMessage('pri(keyring.mnemonicValidate)', { walletEcosystem, seed });
}

export function tonImportCandidates(mnemonic: string): Promise<TonImportCandidateInfo[]> {
  return sendMessage('pri(keyring.tonImportCandidates)', { mnemonic });
}

export function accountUpdateName(address: string, name: string, walletEcosystem: WalletEcosystem): Promise<boolean> {
  return sendMessage('pri(accounts.name)', { address, name, walletEcosystem });
}

export function forgetAccount(address: string, type: 'native' | 'mobile'): Promise<boolean> {
  return sendMessage('pri(accounts.forget)', { address, type });
}

export function getDeletedWallets(): Promise<DeletedWalletSummary[]> {
  return sendMessage('pri(accounts.deleted.list)', null);
}

export function restoreDeletedWallet(id: string): Promise<ResponseRestoreDeletedWallet> {
  return sendMessage('pri(accounts.deleted.restore)', { id });
}

export function validatePassword(password: string): Promise<boolean> {
  return sendMessage('pri(accounts.validate)', { password });
}

export function jsonRestore(file: KeyringPair$Json, password: string, linkedEthereumAddress?: string): Promise<string> {
  return sendMessage('pri(accounts.json.restore)', { file, password, linkedEthereumAddress });
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

export function getTotalBalances(request: RequestTotalBalances | null = null): Promise<ResponseTotalBalances[]> {
  return sendMessage('pri(accounts.totalBalances)', request);
}

/** Every wallet's counted holdings in one read, for the portfolio dashboard. It never moves or signs anything. */
export function getPortfolioHoldings(request: RequestPortfolioHoldings | null = null): Promise<ResponsePortfolioHoldings[]> {
  return sendMessage('pri(accounts.portfolioHoldings)', request);
}

export function getHistory(address: string, network: NetworkName): Promise<TonEventTokens> {
  return sendMessage('pri(accounts.getHistory)', { address, network });
}

export function getRecoveryRecords(): Promise<RecoveryRecordSummary[]> {
  return sendMessage('pri(accounts.recovery.list)', null);
}

export function exportRecoveryRecords(): Promise<{ json: string }> {
  return sendMessage('pri(accounts.recovery.export)', null);
}
