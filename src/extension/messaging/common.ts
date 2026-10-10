import type {
  AccountAccessStatus,
  ActiveTabAuthorizeStatus,
  LegacyPasswordAccountSummary,
  RequestChangePassword,
  RequestUnlockExtension,
  RequestMigratePassword,
  RequestRecoverAccountWithPassword,
  RequestRecoverAccountWithPhrase,
  ResponseRecoverAccountWithPassword,
  ResponseRecoverAccountWithPhrase,
} from '@extension-base/background/types/types';
import type { UniversalWalletMigrationSnapshot } from '@/util/universalWalletMigrationContract';
import { sendMessage } from '@/extension/messaging/index';

export function windowOpen(path: string): Promise<boolean> {
  return sendMessage('pri(window.open)', path);
}

export function isTabAuthorize(): Promise<ActiveTabAuthorizeStatus> {
  return sendMessage('pri(tab.status)');
}

export function pingServiceWorker(): Promise<boolean> {
  return sendMessage('pri(app.port.ping)');
}

export function hasMasterPassword(): Promise<boolean> {
  return sendMessage('pri(keyring.hasMasterPassword)');
}

export function hasAccounts(): Promise<boolean> {
  return sendMessage('pri(keyring.hasAccounts)');
}

export function keyringIsLocked(): Promise<boolean> {
  return sendMessage('pri(keyring.keyringIsLocked)');
}

export function extensionChangePassword(request: RequestChangePassword): Promise<boolean> {
  return sendMessage('pri(keyring.changePassword)', request);
}

export function unlockExtension(request: RequestUnlockExtension): Promise<boolean> {
  return sendMessage('pri(keyring.unlock)', request);
}

export function lockExtension(skipCheck = false): Promise<boolean> {
  return sendMessage('pri(keyring.lock)', skipCheck);
}

export function getExtensionPassword(): Promise<string> {
  return sendMessage('pri(keyring.getPassword)');
}

export function resetWallet(): Promise<boolean> {
  return sendMessage('pri(keyring.reset)');
}

export function getAccessStatus(): Promise<AccountAccessStatus> {
  return sendMessage('pri(keyring.getAccessStatus)');
}

export function getMigrationAccounts(): Promise<LegacyPasswordAccountSummary[]> {
  return sendMessage('pri(keyring.getMigrationAccounts)');
}

export function deferLegacyPasswordMigration(): Promise<boolean> {
  return sendMessage('pri(keyring.deferLegacyPasswordMigration)');
}

export function recoverAccountWithPassword(request: RequestRecoverAccountWithPassword): Promise<ResponseRecoverAccountWithPassword> {
  return sendMessage('pri(keyring.recoverAccountWithPassword)', request);
}

export function recoverAccountWithPhrase(request: RequestRecoverAccountWithPhrase): Promise<ResponseRecoverAccountWithPhrase> {
  return sendMessage('pri(keyring.recoverAccountWithPhrase)', request);
}

export function isNeedMigration(): Promise<boolean> {
  return sendMessage('pri(keyring.isNeedMigration)');
}

export function getUniversalWalletMigrationSnapshot(): Promise<UniversalWalletMigrationSnapshot> {
  return sendMessage('pri(keyring.getUniversalWalletMigrationSnapshot)');
}

export function migrateMasterPassword(request: RequestMigratePassword): Promise<boolean> {
  return sendMessage('pri(keyring.migrateMasterPassword)', request);
}
