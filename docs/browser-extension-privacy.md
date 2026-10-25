# Fearless Wallet browser extension privacy notice

Effective 22 October 2026, for browser extension release 3.0.7.

This notice supplements the
[Fearless Wallet Privacy Policy](https://fearlesswallet.io/privacy/) and describes
the browser extension specifically. The controller and contact details in that
policy continue to apply.

## Wallet data on your device

The extension processes wallet addresses, encrypted account records, wallet
labels, settings, connection permissions, balances and transaction history to
provide wallet functionality. Passwords and decrypted signing material are used
locally to unlock accounts and authorize the actions you request. Secret-bearing
account records are stored encrypted in the browser profile. Public account
metadata and preferences are also stored locally. Local processing is data
handling even when the data is not sent to a developer-operated server.

## Network services and public transactions

The extension contacts blockchain RPC nodes, indexers and supporting services
to obtain network configuration, balances, prices, transaction history and
transaction status, and to submit transactions you approve. Requests can include
public wallet addresses and transaction data; service operators also receive
network connection information such as your IP address. Different selected
networks and custom endpoints use different operators and privacy practices.
Transactions recorded on public blockchains are public and cannot be erased by
removing the extension.

## Websites and connected applications

The extension installs its wallet provider on websites so that decentralized
applications can request a connection. It processes the requesting website's
origin and stores account permissions so that you can review and manage those
connections. The provider does not give a website access to an account merely
because its page loads. Account disclosure and signing are subject to the
wallet's authorization controls. WalletConnect and other explicitly initiated
connection flows also communicate with the relevant connection service.

## Optional Google Drive backups

If you choose Google Drive backup or restore, Google handles authentication and
the extension uses the `drive.appdata` scope to access its application-data
folder in your Google account. Backup files contain password-encrypted wallet
JSON. Wallet labels and public addresses are used as backup file metadata.
OAuth credentials are used to perform the backup or restore you request. This
optional flow transfers that data to Google under Google's privacy policy; it
does not require sharing a plaintext seed phrase with SORAMITSU.

## Other providers

If you open an external purchase, support or other third-party service, that
provider's privacy policy applies to the data it receives. The wallet may pass
the public address and asset details needed for a purchase flow you initiate.

## Use, retention and your controls

The extension uses wallet data and website permissions for its wallet features.
It does not sell those data, use them for personalized advertising, or use them
to determine creditworthiness or lending eligibility. Its handling of data
obtained through Chrome APIs follows the Chrome Web Store User Data Policy,
including its Limited Use requirements.

You can manage connected websites, change wallet settings and remove local
accounts through the extension. Removing an account, resetting the wallet or
uninstalling the extension can remove the local information needed to access
your assets; retain a usable backup first. These actions do not delete public
blockchain transactions or copies in Google Drive. Manage optional cloud
backups through your Google account. External service operators apply their
own retention policies.

For privacy questions, contact **dataprotection@soramitsu.co.jp**. For security
issues, contact **security@soramitsu.co.jp**.
