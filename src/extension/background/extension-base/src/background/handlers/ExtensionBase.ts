import { isEthereumAddress } from '@polkadot/util-crypto';
import { ethers } from 'ethers';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type {
  RequestAccountExport,
  RequestAccountName,
  RequestJsonValidate,
  ResponseAccountExport,
  ValidateJsonResult,
  RequestUpdateMeta,
} from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import { isNativeEVMNetwork } from '@/extension/background/extension-base/src/background/handlers/utils';
import { VALID_MNEMONIC } from '@/consts/derivationPath';
import { WalletEcosystem, type DerivationPath } from '@/interfaces';
import { isSameString } from '@/helpers';

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
type StoredAccount = { address?: string } & Record<string, unknown>;

export default class FWExtensionBase {
  constructor(protected state: State) {}

  migrateExportJSON(address: string): Promise<ResponseAccountExport> {
    return new Promise((resolve) => {
      (chrome.storage.local.get(null) as unknown as Promise<Record<string, StoredAccount>>).then((values) => {
        const accounts = Object.entries(values).filter(([key]) => key.includes('fw:account'));

        const [, json] = accounts.find(([key, value]) => {
          if (!isEthereumAddress(address)) return isSameString(value.address, address);

          const keySplit = key.split(':');
          const addressKey = keySplit[keySplit.length - 1];

          return isSameString(addressKey, address);
        })!;

        resolve({ json: json as unknown as KeyringPair$Json });
      });
    });
  }

  exportJSON({ address, password, network }: RequestAccountExport): ResponseAccountExport {
    if (network && isNativeEVMNetwork(network)) {
      const { privateKey } = this.state.keyringService.accountExportPrivateKey({ address, password });
      const json = ethers.encryptKeystoreJsonSync({ address, privateKey }, password);

      return { json: JSON.parse(json) };
    }

    return { json: this.state.keyringService.backupAccount(address, password)! };
  }

  validateDerivationPath({ value, keypairType }: DerivationPath): boolean {
    try {
      this.state.keyringService.createFromUri(`${VALID_MNEMONIC}${value}`, keypairType);

      return true;
    } catch {
      return false;
    }
  }

  public encodeAddress = (key: string | Uint8Array, ss58Format = 42): string => {
    return this.state.keyringService.encodeAddress(key, ss58Format);
  };

  public decodeAddress = (key: string | Uint8Array, ignoreChecksum?: boolean, ss58Format?: number): Uint8Array => {
    return this.state.keyringService.decodeAddress(key, ignoreChecksum, ss58Format);
  };

  updatePairMeta({ address, meta }: RequestUpdateMeta) {
    this.state.keyringService.saveAccountMeta(address, meta);

    // если передали ethereumAddress, нужно сохранить ethereumAddress для аккаунта
    if (meta.ethereumAddress) {
      const cb = () =>
        Object.keys(this.state.networkService.networkMap).forEach((network) => {
          if (isNativeEVMNetwork(network)) this.state.networkService.evmApiHandler.refreshEvmApi(network);
        });

      if (this.state.currentAccount) {
        this.state.setCurrentAccount(
          {
            ...this.state.currentAccount,
            ethereumAddress: (meta.ethereumAddress as string) ?? '',
          },
          cb
        );
      }

      this.state.updateServiceInfo();
    }

    return true;
  }

  accountUpdateName({ address, name, walletEcosystem }: RequestAccountName): boolean {
    if (walletEcosystem === WalletEcosystem.Ton) this.state.keyringService.tonKeyring.updateAccountName(address, name);
    else this.state.keyringService.saveAccountMeta(address, { name });

    return true;
  }

  jsonValid({ file, password, isSubstrate }: RequestJsonValidate): ValidateJsonResult {
    try {
      const pair = this.state.keyringService.createFromJson(file);

      pair.decodePkcs8(password);

      if (isSubstrate) this.state.keyringService.encodeAddress(pair.address);

      return { value: true };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const errorType =
        message === 'Unable to decode using the supplied passphrase' ? 'jsonPassword' : 'jsonInvalid';

      if (errorType === 'jsonPassword') return { value: false, errorType };
    }

    try {
      const stringFile = JSON.stringify(file);

      ethers.decryptKeystoreJsonSync(stringFile, password);

      return { value: true };
    } catch (error: unknown) {
      const errorType = getErrorMessage(error).includes('incorrect password') ? 'jsonPassword' : 'jsonInvalid';

      return { value: false, errorType };
    }
  }
}
