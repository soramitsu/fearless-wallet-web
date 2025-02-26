import { type KeyringAddress } from '@subwallet/ui-keyring/types';
import type {
  ActiveTabAuthorizeStatus,
  RequestChangePassword,
  RequestUnlockExtension,
  RequestMigratePassword,
} from '@extension-base/background/types/types';
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

export function getMigrationAccounts(): Promise<KeyringAddress[]> {
  return sendMessage('pri(keyring.getMigrationAccounts)');
}

export function isNeedMigration(): Promise<boolean> {
  return sendMessage('pri(keyring.isNeedMigration)');
}

export function migrateMasterPassword(request: RequestMigratePassword): Promise<boolean> {
  return sendMessage('pri(keyring.migrateMasterPassword)', request);
}
