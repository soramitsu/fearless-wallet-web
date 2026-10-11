import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import akkadian from '@/locales/akk/translation.json';
import egyptian from '@/locales/egy/translation.json';
import english from '@/locales/en/translation.json';
import russian from '@/locales/ru/translation.json';

// The screens an upgrade from an old version passes through (the per-account password prompt, Account access,
// Reset wallet, the password change and the export and send errors that lead there). Their messages are about key
// safety, so none of them may fall back to English in a shipped locale.
const SCREENS = [
  'src/screens/addWallet/keyringMigration/MigrationDescription.vue',
  'src/screens/addWallet/keyringMigration/MigrationAccounts.vue',
  'src/screens/addWallet/BackupWalletsList.vue',
  'src/screens/settings/AccountAccessRecovery.vue',
  'src/screens/settings/SettingsPage.vue',
  'src/components/AccountAccessBanner.vue',
  'src/screens/welcome/ResetWallet.vue',
  'src/screens/welcome/ChangePassword.vue',
  'src/screens/accounts/ExportForm.vue',
  'src/screens/wallet&asset/ConfirmationPasswordPopup.vue',
  'src/helpers/transferErrors.ts',
];
// Built at runtime (`welcome.${failure}`), so the source scan cannot see them.
const DYNAMIC_KEYS = ['welcome.changePasswordFailed', 'welcome.createPasswordFailed'];
const NAMESPACES = ['migration', 'accountAccess', 'welcome', 'accounts', 'common', 'ux'];

type Messages = Record<string, unknown>;

const lookup = (messages: Messages, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Messages | undefined)?.[part], messages);

const keysUsedBy = (path: string): string[] => {
  const source = readFileSync(resolve(__dirname, '../..', path), 'utf8');
  const pattern = new RegExp(`['"\`](?:${NAMESPACES.join('|')})\\.[A-Za-z0-9_.]*[A-Za-z0-9_]['"\`]`, 'g');

  return (source.match(pattern) ?? []).map((quoted) => quoted.slice(1, -1));
};

const usedKeys = [...new Set([...SCREENS.flatMap(keysUsedBy), ...DYNAMIC_KEYS])].sort();

describe('upgrade and account access copy', () => {
  it('finds the messages of every screen on the way', () => {
    expect(usedKeys).toEqual(
      expect.arrayContaining([
        'migration.skipForNow',
        'migration.skipWarning',
        'migration.later',
        'migration.moreOptions',
        'migration.resetHint',
        'migration.downloadBackup',
        'migration.usePhrase',
        'migration.loadFailed',
        'migration.legacyPasswordRequired',
        'accountAccess.title',
        'accountAccess.settingsDescription',
        'accountAccess.previousPasswordRequired',
        'accountAccess.unlockAccount',
        'accountAccess.wrongPassword',
        'accountAccess.phraseMismatch',
        'welcome.resetBackupDescription',
        'welcome.resetHaveBackups',
        'accounts.exportFailed',
      ])
    );
  });

  it.each([
    ['en', english],
    ['ru', russian],
    ['akk', akkadian],
    ['egy', egyptian],
  ] as const)('has every one of them in %s', (_, messages) => {
    const missing = usedKeys.filter((key) => {
      const value = lookup(messages as Messages, key);

      return typeof value !== 'string' || value.trim() === '';
    });

    expect(missing).toEqual([]);
  });

  it('keeps the plural branches and placeholders of English in every locale', () => {
    const tokens = (value: string) => (value.match(/\{[^{}]+\}/g) ?? []).sort();

    for (const key of usedKeys) {
      const source = lookup(english, key) as string;

      for (const messages of [russian, akkadian, egyptian]) {
        const translation = lookup(messages, key) as string;

        expect(translation.split('|'), key).toHaveLength(source.split('|').length);
        expect(tokens(translation), key).toEqual(tokens(source));
      }
    }
  });

  // 3.0.5 deleted the accounts a user skipped; 4.2.0 keeps them. The prompt must not say otherwise.
  it('never tells the user that skipped accounts are reset, deleted or lost', () => {
    for (const key of ['migration.enterPass', 'migration.skipWarning', 'migration.enterPassRow']) {
      const text = lookup(english, key) as string;

      expect(text, key).not.toMatch(/\breset|delet|\blost\b|\blose\b/i);
    }

    expect(lookup(english, 'migration.accessLost')).toBeUndefined();
  });
});
