const WARNING_MESSAGES = {
  mnemonicSequence: {
    text: 'Invalid passphrase',
    subtext: 'Invalid passphrase sequence, please try again',
  },
  mnemonic: {
    text: 'Mnemonic is invalid',
    subtext: 'Please, make sure your input contains 12 words.',
  },
  substrateDP: {
    text: 'Substrate Derivation Path is invalid',
    subtext: 'Please, substrate derivation path correctness and try again.',
  },
  ethereumDP: {
    text: 'Ethereum Derivation Path is invalid',
    subtext: 'Please, ethereum derivation path correctness and try again.',
  },
  rawSeed: {
    text: 'Keystore decryption failed',
    subtext: 'Please, make sure that your input contains 64 hex symbols.',
  },
  jsonPassword: {
    text: 'Keystore decryption failed',
    subtext: 'Please, check password correctness and try again.',
  },
  jsonInvalid: {
    text: 'Recovery JSON is invalid',
    subtext: 'Please, make sure that your input contains valid json.',
  },
  isNotSamePassword: {
    text: 'Is not same password',
    subtext: 'Please make sure the password you entered is the password for your current wallet.',
  },
};

const EXPORT_WARNING =
  'Sharing or copying your secret is a high risk operation, don’t send it to anyone. Would you like to proceed with sharing/copying process?';

const EXPORT_ETHEREUM_WALLET_ERROR = 'You didn’t add an ethereum account.';

const PASSWORD_INFO = 'This password protects your wallet. Make sure you remember it and do not share it with anybody.';

const PASSWORD_SAME = 'Please make sure the password you entered is the password for your current wallet.';

const MOCK_PASSWORD = 'The wallet is already being used to replace other networks. The old password will be used.';

const ALL_ASSETS_HIDDEN = 'You have hidden all assets.';

const EXISTENTIAL_DEPOSIT_WARNING =
  'This transaction will result in the account going below the Existential Deposit, which will cause it to be reaped (the account will be wiped from the blockchain’s state to conserve space). If you choose to continue you will lose any funds that are below the existential deposit amount set by the network. For detailed information please refer to the official network documentation (e.g., the Polkadot Wiki). Fearless Wallet is a fully non-custodial application and has no control or knowledge of any of your actions on the network itself. ONLY CONTINUE IF YOU FULLY AGREE TO AND UNDERSTAND THE IMPLICATIONS';

const IS_NOT_NETWORK_ADDRESS =
  'According to the address provided you’re trying to make a transfer on the wrong network.';

const NO_ACCOUNTS_MESSAGES = 'You don’t have any account. Please create an account and refresh the application’s page.';

type WarningValueName = keyof typeof WARNING_MESSAGES | '';

const MOBILE_CONNECTOR_MESSAGES = {
  QR_HEADER: 'Scan the QR code using the Fearless mobile app',
  ACTIVE_MOBILE_ACCOUNT_EXISTS: 'There is an active connection, please delete mobile wallet and try again',
  WALLET_ALREADY_EXISTS: 'You already have this wallet',
  CONNECTED: 'Mobile wallet connected to Fearless Wallet Extension',
  NO_ANSWER: 'No answer from your wallet received yet. Please make sure the wallet is open',
};

export {
  MOBILE_CONNECTOR_MESSAGES,
  MOCK_PASSWORD,
  PASSWORD_INFO,
  PASSWORD_SAME,
  EXPORT_WARNING,
  WARNING_MESSAGES,
  ALL_ASSETS_HIDDEN,
  IS_NOT_NETWORK_ADDRESS,
  NO_ACCOUNTS_MESSAGES,
  EXISTENTIAL_DEPOSIT_WARNING,
  EXPORT_ETHEREUM_WALLET_ERROR,
  WarningValueName,
};
