import { Keyring, keyring } from '@polkadot/ui-keyring';

export const lockAccount = (address: string): void => {
  try {
    const pair = keyring.getPair(address);

    if (pair) {
      pair.lock();
    }
  } catch (error) {
    console.error('Unable to lock account', error);
  }
};

function extract(address: string) {
  const rs = keyring.getPair(address);

  console.info(rs.publicKey);
}

export function extractPrivateKey(keyring: Keyring, address: string, password: string) {
  extract.call(keyring, address);
}

export const unlockAccount = (signAddress: string, signPassword?: string): string | null => {
  let publicKey;

  try {
    publicKey = keyring.decodeAddress(signAddress);
  } catch (error) {
    console.error(error);

    return 'Unable to decode address';
  }

  const pair = keyring.getPair(publicKey);

  if (!pair) {
    return 'Unable to find pair';
  }

  if (pair.isLocked && !signPassword) {
    return 'Password needed to unlock the account';
  }

  if (pair.isLocked) {
    try {
      pair.decodePkcs8(signPassword);
    } catch (e) {
      return 'Invalid password';
    }
  }

  return null;
};
