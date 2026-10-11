import * as tonWebMnemonic from 'tonweb-mnemonic';
import { BehaviorSubject } from 'rxjs';
import { tonStore } from './../../stores/TonStore';
import { validateBip39Mnemonic } from './Bip39';
import { encryptTonSeed, TonSeedVault } from './TonSeedVault';
import { type KeyringService } from '.';
import type { TonStoreAccount } from '../../stores/TonStore';
import type { FWKeyringMeta } from '../../types';
import type { SubjectInfo } from '@subwallet/ui-keyring/observable/types';
import type { Address, WalletContractV4 } from '@ton/ton';
import { WalletEcosystem } from '@/interfaces';
import {
  createTonWalletContractV4R2,
  deriveCompatibleTonKeyPair,
  deriveTonImportChoice,
  type TonImportChoice,
  type TonImportDerivation,
} from '@/util/tonKeyring';
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
  readonly vault = new TonSeedVault(this);

  constructor(private keyringService: KeyringService) {
    // Background start-up awaits this read through `tonStore.loaded`.
    void this.loadAll().catch(console.error);
  }

  // Reads every stored TON account again; start-up calls this after a failed read.
  loadAll(): Promise<void> {
    const saveAccounts = async (address: string, record: TonStoreAccount) => this.setAccounts({ ...record, address });

    return tonStore.all(saveAccounts);
  }

  setAccounts({ address, name, cipherSeed, pendingCipherSeed, meta, publicKeyHex }: TonStoreAccount) {
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
        pendingCipherSeed,
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

  // Only the name changes: the stored record keeps its ciphertexts and any field this version does not know.
  async updateAccountName(address: string, name: string): Promise<void> {
    const {
      json: { meta },
    } = this.accountSubject.value[address];
    const nextMeta = withUniversalWalletKeyringMeta(
      address,
      {
        ...meta,
        name,
        walletEcosystem: WalletEcosystem.Ton,
      },
      WalletEcosystem.Ton
    );

    await tonStore.updateAndWait(
      address,
      (current) => (current ? { ...current, name, meta: nextMeta } : undefined),
      (record) => this.setAccounts({ ...record, address })
    );
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

  async mnemonicToKeyPair(mnemonic: string[], password?: string, expectedPublicKey?: Uint8Array) {
    return deriveCompatibleTonKeyPair(mnemonic, expectedPublicKey, password);
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

  createContractV4(publicKey: Uint8Array) {
    const wallet = createTonWalletContractV4R2(publicKey);

    return wallet;
  }

  // `choice` is the address the user picked on the import screen for the text in `suri`; the phrase that
  // opens it is stored, tidied or exactly as typed. Without one, a BIP39 phrase gets the universal address
  // and any other phrase the native one, as for a newly created wallet.
  async createAccount(suri: string, meta: FWKeyringMeta | string = '', password?: string, choice?: TonImportChoice) {
    const chosen = choice && (await deriveTonImportChoice(suri, choice));
    const account = chosen || (await deriveCompatibleTonKeyPair(suri.split(' ')));
    const suriArray = (chosen ? chosen.phrase : suri).split(' ');
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
    const tonDerivation: TonImportDerivation = choice?.derivation ?? (validateBip39Mnemonic(suriArray) ? 'universal' : 'native');
    const wallet = this.createContractV4(account.publicKey);
    const address = this.getUserFriendlyAddress(wallet.address);
    const publicKeyHex = bytesToHex(account.publicKey);

    // Already in the wallet: its record (name, settings, stored phrase) stays as it is. Only a stored
    // phrase that no longer opens with the current password is replaced, by this one, which derives
    // the same key.
    if (password && this.accountSubject.value[address]) {
      await this.vault
        .decryptVerified(address, () => password)
        .catch(() => this.vault.recoverWithPhrase(address, suriArray.join(' '), () => password));

      return { wallet, address };
    }

    const name = initialMeta.name ?? '';
    const universalMeta = withUniversalWalletKeyringMeta(
      address,
      {
        ...initialMeta,
        tonAddress: address,
        tonPublicKeyHex: publicKeyHex,
        tonDerivation,
      },
      WalletEcosystem.Ton
    );

    // Only the universal key comes from a derivation path, so no path is recorded for the others.
    if (tonDerivation !== 'universal') {
      universalMeta.universalWallet.publicAccounts = universalMeta.universalWallet.publicAccounts.map((publicAccount) => {
        if (publicAccount.ecosystem !== WalletEcosystem.Ton || publicAccount.address !== address) return publicAccount;

        const { derivationPath: _universalPath, ...withoutPath } = publicAccount;

        return withoutPath;
      });
    }

    if (password) {
      const cipherSeed = this.encodeMnemonic(suriArray, password);
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
    return encryptTonSeed(mnemonicArray.join(' '), password);
  }

  /** The stored phrase, exactly as stored, once it derives this account's public key. Throws
   * `ton_seed_needs_previous_password` when it does not open with the current master password. */
  decodeMnemonicVerified(address: string): Promise<string> {
    return this.vault.decryptVerified(address, () => this.keyringService.getPassword());
  }
}
