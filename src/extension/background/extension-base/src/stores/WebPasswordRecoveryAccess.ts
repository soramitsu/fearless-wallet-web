// A failed one-time migration retains authenticated recovery access. Other
// requests require durable password authority before they can mutate or sign.
const recoveryMessages = new Set([
  'pri(app.port.ping)', 'pri(app.isReady)', 'pri(keyring.hasMasterPassword)',
  'pri(keyring.hasAccounts)', 'pri(keyring.keyringIsLocked)', 'pri(keyring.unlock)', 'pri(keyring.lock)',
  'pri(keyring.getAccessStatus)', 'pri(keyring.getMigrationAccounts)', 'pri(keyring.isNeedMigration)',
  'pri(keyring.getUniversalWalletMigrationSnapshot)', 'pri(keyring.export.mnemonic)', 'pri(keyring.export.rowSeed)',
  'pri(accounts.export.json)', 'pri(migrate.export.json)', 'pri(accounts.deleted.list)', 'pri(accounts.subscribe)',
  'pri(accounts.validate)', 'pri(networkMap.getSubscription)', 'pri(selectedNetworks.getSubscription)',
  'pri(accounts.totalBalances)', 'pri(accounts.soraFees.subscribe)', 'pri(price.subscription)', 'pri(price.getFiats)',
  'pri(balance)', 'pri(policy.soraDisclaimer.status)', 'pri(security.legacyExposure.status)',
]);

export function isWebPasswordRecoveryRequest(message: string): boolean {
  return recoveryMessages.has(message);
}
