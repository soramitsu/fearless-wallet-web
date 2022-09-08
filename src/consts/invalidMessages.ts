export const INVALID_MESSAGES = {
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
};

export type InvalidValueName = keyof typeof INVALID_MESSAGES | '';
