// Local scope, like the security notice: untranslated locales show the complete English text until reviewed
// translations are available.
export const universalWalletPasswordMessages = {
  'en-EN': {
    label: 'Wallet password',
    close: 'Close',
    title: 'Move funds from old addresses',
    description:
      "These addresses don't use your wallet password, so your recovery words alone open them. Send their funds to the new password-protected addresses, then tap Switch.",
    oldAddress: 'Old',
    newAddress: 'New',
    copy: 'Copy',
    copied: 'Copied',
    switch: 'Switch',
    switching: 'Checking…',
    later: 'Later',
    switched: 'Switched',
    stillFunded: 'Still holds funds',
    unchecked: "Couldn't check. Try again later.",
    done: 'Done',
    protected: 'Your password now protects these accounts.',
    unknownTitle: 'Does this wallet have a password?',
    unknownDescription:
      "If its derivation path has a ///password, Bitcoin, Solana, TON and Taira don't use it yet. Enter the path to protect them.",
    pathLabel: 'Derivation path',
    pathPlaceholder: '//hard/soft///password',
    continue: 'Continue',
    noPassword: 'No password',
    pathMismatch: "This path doesn't open this wallet.",
    pathWithoutPassword: 'This path has no password, so there is nothing to protect.',
    failed: 'Something went wrong. Try again.',
    reopen: 'Old addresses without password',
    bitcoin: 'Bitcoin',
    bitcoinTestnet: 'Bitcoin testnet',
    solana: 'Solana',
    ton: 'TON',
    iroha: 'Taira',
  },
};
