import assert from 'assert';
import { keyring } from '@polkadot/ui-keyring';
import { MetadataDef } from '@polkadot/extension-inject/types';
import {
  CachedUnlocks,
  RequestAccountBatchExport,
  RequestAccountCreateExternal,
  RequestAccountExport,
  RequestAccountExportPrivateKey,
  RequestAccountShow,
  RequestAccountTie,
  RequestAccountName,
  RequestBatchRestore,
  RequestJsonValidate,
  RequestSigningIsLocked,
  ResponseAccountExport,
  ResponseAccountExportPrivateKey,
  ResponseAccountsExport,
  ResponseJsonGetAccountInfo,
  ResponseSigningIsLocked,
  ValidateJsonResult,
} from '../types/types';
import State from './State';
import { state } from '.';
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import { VALID_MNEMONIC } from '@/consts/derivationPath';
import { DerivationPath } from '@/interfaces';

export default class FWExtensionBase {
  protected token: string;
  protected cachedUnlocks: CachedUnlocks;
  protected state: State;

  constructor() {
    this.cachedUnlocks = {};
    this.state = state;
    this.token = '';
  }

  accountsExport({ address, password }: RequestAccountExport): ResponseAccountExport {
    return { exportedJson: keyring.backupAccount(keyring.getPair(address), password) };
  }

  async accountsBatchExport({ addresses, password }: RequestAccountBatchExport): Promise<ResponseAccountsExport> {
    return {
      exportedJson: await keyring.backupAccounts(addresses, password),
    };
  }

  accountsCreateExternal({ address, genesisHash, name }: RequestAccountCreateExternal): boolean {
    keyring.addExternal(address, { genesisHash, name });

    return true;
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

  accountsShow({ address, isShowing }: RequestAccountShow): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, isHidden: !isShowing });

    return true;
  }

  accountsTie({ address, genesisHash }: RequestAccountTie): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, genesisHash });

    return true;
  }

  accountUpdateName({ address, name }: RequestAccountName): boolean {
    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    keyring.saveAccountMeta(pair, { ...pair.meta, name });

    return true;
  }

  metadataGet(genesisHash: string | null): MetadataDef | null {
    return this.state.knownMetadata.find((result) => result.genesisHash === genesisHash) || null;
  }

  metadataList(): MetadataDef[] {
    return this.state.knownMetadata;
  }

  refreshAccountPasswordCache(pair: KeyringPair): number {
    const { address, meta } = pair;
    const ethereumAddress = meta.ethereumAddress as string;

    // const { cachedUnlocks } = await state.getFromStorage(['cachedUnlocks']);
    const savedExpiry = this.cachedUnlocks[address] || 0;

    const remainingTime = savedExpiry - Date.now();

    if (remainingTime < 0) {
      this.cachedUnlocks[address] = 0;
      if (ethereumAddress) this.cachedUnlocks[ethereumAddress] = 0;

      pair.lock();

      if (ethereumAddress) {
        const ethereumPair = keyring.getPair(ethereumAddress);

        ethereumPair.lock();
      }

      return 0;
    }

    return remainingTime;
  }

  signingIsLocked({ address }: RequestSigningIsLocked): ResponseSigningIsLocked {
    // const queued = await state.getSignRequest(id);
    // assert(queued, 'Unable to find request');
    // const address = queued.request.payload.address;

    const pair = keyring.getPair(address);

    assert(pair, 'Unable to find pair');

    const remainingTime = this.refreshAccountPasswordCache(pair);

    return {
      isLocked: pair.isLocked,
      remainingTime,
    };
  }

  jsonGetAccountInfo(json: KeyringPair$Json): ResponseJsonGetAccountInfo {
    try {
      const {
        address,
        meta: { genesisHash, name, ethereumAddress },
        type,
      } = keyring.createFromJson(json);

      return {
        address,
        ethereumAddress,
        genesisHash,
        name,
        type,
      } as ResponseJsonGetAccountInfo;
    } catch (e) {
      console.error(e);
      throw new Error((e as Error).message);
    }
  }

  batchRestore({ file, password }: RequestBatchRestore): void {
    try {
      keyring.restoreAccounts(file, password);
    } catch (error) {
      throw new Error((error as Error).message);
    }
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
    return state.accountExportPrivateKey({ address, password });
  }
}
