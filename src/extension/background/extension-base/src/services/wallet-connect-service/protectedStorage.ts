import AccountsStore from '@extension-base/stores/Accounts';
import { assertWebStorageWritable } from '@extension-base/stores/WebStorageMode';
import { decodeWebPassword, validateWebPasswordRecord, WEB_PASSWORD_RECORD_KEY } from '@extension-base/stores/WebPasswordRecord';
import { compareSync } from 'bcryptjs';
import { base64 } from '@scure/base';
import { readSessionKey, saveSessionKey } from './sessionKey';
import WalletConnectStorage from './storage';
import { emptyRecord, importSdkRecords, SDK_KEYCHAIN, SDK_RECORDS, WALLET_CONNECT_RECORD } from './protocol/store';
import { ProtocolKey, VAULT_KEY, type Envelope } from './protocol/vault';
import { isHexKey } from './protocol/crypto';
import { IS_EXTENSION } from '@/consts/global';

const legacyKeys = [WALLET_CONNECT_RECORD, SDK_KEYCHAIN, ...SDK_RECORDS, 'wc@2:client:0.3//request'];

export class ProtectedStorage {
  private key?: ProtocolKey;
  private current?: Envelope;
  private closed = false;

  constructor(private readonly password: () => string,
    private readonly legacy: Pick<WalletConnectStorage, 'getItem' | 'removeItem'> = new WalletConnectStorage(),
    private readonly accounts: Pick<AccountsStore, 'mutateRecordsAndWait'> & { getAndWait(key: string): Promise<unknown> } = new AccountsStore()) {}

  close() { this.closed = true; this.key?.clear(); this.key = undefined; }

  private authenticated() {
    if (!IS_EXTENSION) assertWebStorageWritable();
    const password = this.password();
    if (this.closed || (!password && !this.key)) throw new Error('Unlock the wallet to use WalletConnect');
    return password;
  }

  private async read() { return await this.accounts.getAndWait(VAULT_KEY) as unknown as Envelope | undefined; }

  async getItem<T>(name: string): Promise<T | undefined> {
    if (name !== WALLET_CONNECT_RECORD) throw new Error('Unexpected WalletConnect storage key');
    this.current = await this.read();
    const cached = this.current && !this.password() ? await readSessionKey() : undefined;
    if (this.closed) throw new Error('WalletConnect vault closed');
    this.key = new ProtocolKey(cached ? base64.decode(cached) : this.authenticated(), this.current?.salt);
    let text: string;
    if (this.current !== undefined) text = this.key.open(this.current);
    else {
      const own = await this.legacy.getItem<ReturnType<typeof emptyRecord>>(name);
      if (own !== undefined && (!own || own.version !== 1 || !isHexKey(own.clientSeed) ||
        !own.keys || typeof own.keys !== 'object' || Array.isArray(own.keys)))
        throw new Error('Invalid legacy WalletConnect record');
      const imported = own ?? await importSdkRecords(this.legacy) ?? emptyRecord();
      text = JSON.stringify(imported);
      await this.setItem(name, imported);
      const saved = await this.read();
      this.authenticated();
      if (!saved || this.key.open(saved) !== text) throw new Error('WalletConnect migration was not verified');
    }
    const record = JSON.parse(text) as T;
    for (const old of legacyKeys) {
      const plaintext = await this.legacy.getItem(old);
      if (plaintext !== undefined) {
        if (old === WALLET_CONNECT_RECORD && JSON.stringify(plaintext) !== text) throw new Error('Legacy WalletConnect record changed');
        this.authenticated();
        await this.legacy.removeItem(old);
      }
    }
    this.authenticated();
    if (!cached) await saveSessionKey(() => {
      this.authenticated();
      return this.key!.exportSessionKey();
    });
    return record;
  }

  async setItem<T>(name: string, value: T): Promise<void> {
    this.authenticated();
    if (name !== WALLET_CONNECT_RECORD || !this.key) throw new Error('WalletConnect vault is not open');
    const sealed = this.key.seal(JSON.stringify(value));
    const passwordKey = IS_EXTENSION ? 'keyring' : WEB_PASSWORD_RECORD_KEY;
    await this.accounts.mutateRecordsAndWait([VAULT_KEY, passwordKey], records => {
      const password = this.authenticated();
      const latest = records[VAULT_KEY] as Envelope | undefined;
      if (latest?.version !== this.current?.version || latest?.salt !== this.current?.salt ||
        latest?.nonce !== this.current?.nonce || latest?.ciphertext !== this.current?.ciphertext)
        throw new Error('WalletConnect vault changed');
      if (!this.current) {
        const verifier = IS_EXTENSION ? records[passwordKey] as { passwordHash?: string } | undefined
          : decodeWebPassword(validateWebPasswordRecord(records[passwordKey]).serialized);
        if (!verifier?.passwordHash || !compareSync(password, verifier.passwordHash)) throw new Error('Wallet password changed');
      }
      return { entries: { [VAULT_KEY]: sealed }, remove: [] };
    });
    this.current = sealed;
  }
}
