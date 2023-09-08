import assert from 'assert';
import { keyringService } from '@extension-base/services';
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
} from '@/extension/background/extension-base/src/background/types';
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
    return { exportedJson: keyringService.backupAccount(address, password)! };
  }

  validateDerivationPath({ value, keypairType }: DerivationPath): boolean {
    try {
      keyringService.createFromUri(`${VALID_MNEMONIC}${value}`, keypairType);

      return true;
    } catch {
      return false;
    }
  }

  public encodeAddress = (key: string | Uint8Array, ss58Format = 42): string => {
    return keyringService.encodeAddress(key, ss58Format);
  };

  public decodeAddress = (key: string | Uint8Array, ignoreChecksum?: boolean, ss58Format?: number): Uint8Array => {
    return keyringService.decodeAddress(key, ignoreChecksum, ss58Format);
  };

  updatePairMeta({ address, meta }: RequestUpdateMeta) {
    keyringService.saveAccountMeta(address, meta);

    return true;
  }

  accountUpdateName({ address, name }: RequestAccountName): boolean {
    keyringService.saveAccountMeta(address, { name });

    return true;
  }

  getRemainingTime(pair: KeyringPair | null): number {
    if (!pair) return -1;

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

      keyringService.lockPair(pair);

      if (ethereumAddress) {
        this.cachedUnlocks[ethereumAddress] = 0;

        keyringService.lockPair(ethereumAddress);
      }

      return 0;
    }

    return remainingTime;
  }

  signingIsLocked({ address }: RequestSigningIsLocked): ResponseSigningIsLocked {
    const pair = keyringService.getPair(address);

    assert(pair, 'Unable to find pair');

    const remainingTime = this.refreshAccountPasswordCache(pair);

    return {
      isLocked: pair.isLocked,
      remainingTime,
    };
  }

  jsonValid({ file, password, isSubstrate }: RequestJsonValidate): ValidateJsonResult {
    try {
      const pair = keyringService.restoreAccount(file, password);

      pair.decodePkcs8(password);

      if (isSubstrate) keyringService.encodeAddress(pair.address);

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
