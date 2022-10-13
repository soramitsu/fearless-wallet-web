const INVALID_MESSAGES = {
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

type InvalidValueName = keyof typeof INVALID_MESSAGES | '';

export {
  MOCK_PASSWORD,
  PASSWORD_INFO,
  PASSWORD_SAME,
  EXPORT_WARNING,
  INVALID_MESSAGES,
  EXPORT_ETHEREUM_WALLET_ERROR,
  InvalidValueName,
};
