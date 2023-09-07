import assert from 'assert';
import { keyring } from '@polkadot/ui-keyring';
import type {
  CachedUnlocks,
  RequestAccountExport,
  RequestAccountExportPrivateKey,
  RequestAccountName,
  RequestJsonValidate,
  RequestSigningIsLocked,
  ResponseAccountExport,
  ResponseAccountExportPrivateKey,
  ResponseSigningIsLocked,
  ValidateJsonResult,
  RequestUpdateMeta,
} from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { KeyringPair } from '@polkadot/keyring/types';
import { VALID_MNEMONIC } from '@/consts/derivationPath';
import { DerivationPath } from '@/interfaces';

export default class FWExtensionBase {
  protected token: string;
  public cachedUnlocks: CachedUnlocks;
  protected state: State;

  constructor(state: State) {
    this.cachedUnlocks = {};
    this.state = state;
    this.token = '';
  }

  accountsExport({ address, password }: RequestAccountExport): ResponseAccountExport {
    return { exportedJson: keyring.backupAccount(keyring.getPair(address), password) };
  }

  validateDerivationPath({ value, keypairType }: DerivationPath): boolean {
    try {
      keyring.createFromUri(`${VALID_MNEMONIC}${value}`, {}, keypairType);

      return true;
    } catch {
      return false;
    }
  }

  public encodeAddress = (key: string | Uint8Array, ss58Format = 42): string => {
    return keyring.encodeAddress(key, ss58Format);
  };

  public decodeAddress = (key: string | Uint8Array, ignoreChecksum?: boolean, ss58Format?: number): Uint8Array => {
    return keyring.decodeAddress(key, ignoreChecksum, ss58Format);
  };

  updatePairMeta({ address, meta }: RequestUpdateMeta) {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, ...meta });

    return true;
  }

  accountUpdateName({ address, name }: RequestAccountName): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, name });

    return true;
  }

  getRemainingTime(pair: KeyringPair): number {
    const { address } = pair;

    const savedExpiry = this.cachedUnlocks[address] || 0;

    const remainingTime = savedExpiry - Date.now();

    return remainingTime;
  }

  refreshAccountPasswordCache(pair: KeyringPair): number {
    const remainingTime = this.getRemainingTime(pair);
    const { address, meta } = pair;

    const ethereumAddress = meta.ethereumAddress as string;

    if (remainingTime < 0) {
      this.cachedUnlocks[address] = 0;

      pair.lock();

      if (ethereumAddress) {
        this.cachedUnlocks[ethereumAddress] = 0;
        const ethereumPair = keyring.getPair(ethereumAddress);

        ethereumPair.lock();
      }

      return 0;
    }

    return remainingTime;
  }

  signingIsLocked({ address }: RequestSigningIsLocked): ResponseSigningIsLocked {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    const remainingTime = this.refreshAccountPasswordCache(pair);

    return {
      isLocked: pair.isLocked,
      remainingTime,
    };
  }

  jsonValid({ file, password, isSubstrate }: RequestJsonValidate): ValidateJsonResult {
    try {
      const pair = keyring.restoreAccount(file, password);

      pair.decodePkcs8(password);

      if (isSubstrate) keyring.encodeAddress(pair.address);

      return { value: true };
    } catch (error: any) {
      const errorType =
        error.message === 'Unable to decode using the supplied passphrase' ? 'jsonPassword' : 'jsonInvalid';

      return { value: false, errorType };
    }
  }

  protected accountExportPrivateKey({
    address,
    password,
  }: RequestAccountExportPrivateKey): ResponseAccountExportPrivateKey {
    return this.state.accountExportPrivateKey({ address, password });
  }
}
