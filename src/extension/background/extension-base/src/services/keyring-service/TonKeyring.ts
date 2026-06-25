import * as tonWebMnemonic from 'tonweb-mnemonic';
import CryptoJS from 'crypto-js';
import { BehaviorSubject } from 'rxjs';
import { tonStore } from './../../stores/TonStore';
import { validateBip39Mnemonic } from './Bip39';
import { type KeyringService } from '.';
import type { TonStoreAccount } from '../../stores/TonStore';
import type { FWKeyringMeta } from '../../types';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import type { Address, WalletContractV4 } from '@ton/ton';
import { WalletEcosystem } from '@/interfaces';
import { createTonWalletContractV4R2, deriveTonAccount } from '@/util/tonKeyring';
import { withUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';

type TonAccountInfo = Omit<TonStoreAccount, 'publicKeyHex'> & {
  walletEcosystem: WalletEcosystem;
  publicKey: Uint8Array;
  walletContract: WalletContractV4;
};

type TonAccount = Record<string, TonAccountInfo>;

export function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('hex');
}

export function hexToBytes(hex: string) {
  return Uint8Array.from(Buffer.from(hex, 'hex')) as Uint8Array;
}

export class TonKeyringService {
  readonly accountSubject: BehaviorSubject<SubjectInfo & TonAccount> = new BehaviorSubject({});

  constructor(private keyringService: KeyringService) {
    const saveAccounts = async (address: string, { name, cipherSeed, meta, publicKeyHex }: TonStoreAccount) =>
      this.setAccounts({ address, name, cipherSeed, meta, publicKeyHex });

    tonStore.all(saveAccounts);
  }

  setAccounts({ address, name, cipherSeed, meta, publicKeyHex }: TonStoreAccount) {
    const accounts = this.accountSubject.value;

    const publicKey = hexToBytes(publicKeyHex);
    const walletContract = this.keyringService.tonKeyring.createContractV4(publicKey);
    const accountMeta: FWKeyringMeta = meta ?? {
      name,
      cipherSeed,
      walletEcosystem: WalletEcosystem.Ton,
    };

    this.accountSubject.next({
      ...accounts,
      [address]: {
        name,
        address,
        cipherSeed,
        walletContract,
        publicKey,
        walletEcosystem: WalletEcosystem.Ton,
        json: {
          address,
          meta: accountMeta,
        },
        option: {
          name,
          key: address,
          value: address,
        },
      },
    });
  }

  updateAccountName(address: string, name: string) {
    const {
      cipherSeed,
      json: { meta },
      publicKey: pubKey,
    } = this.accountSubject.value[address];
    const publicKeyHex = bytesToHex(pubKey);
    const nextMeta = withUniversalWalletKeyringMeta(
      address,
      {
        ...meta,
        name,
        walletEcosystem: WalletEcosystem.Ton,
      },
      WalletEcosystem.Ton
    );

    tonStore.set(address, { name, address, cipherSeed, meta: nextMeta, publicKeyHex });

    this.setAccounts({ address, name, publicKeyHex, cipherSeed, meta: nextMeta });
  }

  getAccount(_address: string) {
    return this.getAccounts().find(({ address }) => address === _address)!;
  }

  getAccounts() {
    return Object.values(this.accountSubject.value).map(({ json: { address }, name, walletEcosystem }) => ({
      address,
      walletEcosystem,
      meta: {
        name,
        walletEcosystem,
        isMobile: false,
      } as FWKeyringMeta,
    }));
  }

  async generateMnemonic(password?: string, wordsCount = 24) {
    return await tonWebMnemonic.generateMnemonic(wordsCount, password);
  }

  async validateMnemonic(mnemonic: string[], password?: string) {
    return validateBip39Mnemonic(mnemonic) || (await tonWebMnemonic.validateMnemonic(mnemonic, password));
  }

  async mnemonicToKeyPair(mnemonic: string[], password?: string) {
    if (password) return await tonWebMnemonic.mnemonicToKeyPair(mnemonic, password);

    const account = deriveTonAccount({ mnemonic: mnemonic.join(' ') });

    return {
      publicKey: account.publicKey,
      secretKey: account.secretKey,
    };
  }

  async isPasswordNeeded(mnemonic: string[]) {
    return await tonWebMnemonic.isPasswordNeeded(mnemonic);
  }

  async forgetAccount(address: string) {
    const accounts = this.accountSubject.value;

    delete accounts[address];

    this.accountSubject.next({ ...accounts });

    tonStore.remove(address);
  }

  decode(value: string) {
    const password = this.keyringService.getPassword();

    const bytes = CryptoJS.AES.decrypt(value, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    return decryptedText;
  }

  encode(value: string) {
    const cipherText = CryptoJS.AES.encrypt(value, '').toString();

    return cipherText;
  }

  createContractV4(publicKey: Uint8Array) {
    const wallet = createTonWalletContractV4R2(publicKey);

    return wallet;
  }

  async createAccount(suri: string, meta: FWKeyringMeta | string = '', password?: string) {
    const suriArray = suri.split(' ');
    const initialMeta: FWKeyringMeta =
      typeof meta === 'string'
        ? {
            name: meta,
            walletEcosystem: WalletEcosystem.Ton,
          }
        : {
            ...meta,
            walletEcosystem: WalletEcosystem.Ton,
          };
    const account = deriveTonAccount({ mnemonic: suriArray.join(' ') });
    const wallet = this.createContractV4(account.publicKey);
    const address = account.addressNonBounceable;
    const name = initialMeta.name ?? '';
    const universalMeta = withUniversalWalletKeyringMeta(
      address,
      {
        ...initialMeta,
        tonAddress: account.addressNonBounceable,
        tonPublicKeyHex: account.publicKeyHex,
      },
      WalletEcosystem.Ton
    );

    if (password) {
      const cipherSeed = this.encodeMnemonic(suriArray, password);
      const publicKeyHex = account.publicKeyHex;

      tonStore.set(address, { name, address, cipherSeed, meta: universalMeta, publicKeyHex });

      this.setAccounts({ address, name, cipherSeed, meta: universalMeta, publicKeyHex });
    }

    return { wallet, address };
  }

  getUserFriendlyAddress(address: Address) {
    return address.toString({
      bounceable: false,
      urlSafe: true,
    });
  }

  encodeMnemonic(mnemonicArray: string[], password: string) {
    const mnemonic = mnemonicArray.join(' ');
    const cipherText = CryptoJS.AES.encrypt(mnemonic, password).toString();

    return cipherText;
  }

  decodeMnemonic(cipherMnemonic: string) {
    const password = this.keyringService.getPassword();

    const bytes = CryptoJS.AES.decrypt(cipherMnemonic, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    return decryptedText;
  }
}
