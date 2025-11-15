type Account = {
  address: string;
  meta: Record<string, unknown>;
};

class MockKeyring {
  #accounts: Account[] = [];

  loadAll(): void {
    // noop
  }

  addExternal(address: string, meta: Record<string, unknown> = {}) {
    const account = { pair: { address, meta }, json: null };
    this.#accounts.push({ address, meta });

    return account;
  }

  getAccounts(): Account[] {
    return this.#accounts;
  }

  getPair(address: string) {
    return { address, meta: {} };
  }

  createFromUri(suri: string, meta: Record<string, unknown>) {
    return { address: `${suri}-address`, meta };
  }

  addPair(): void {
    // noop
  }

  createFromJson() {
    return { address: 'json-address', meta: {} };
  }

  restoreAccount() {
    return { address: 'restored-address', meta: {} };
  }

  backupAccount() {
    return {};
  }

  saveAccountMeta(): void {
    // noop
  }

  encryptAccount(): void {
    // noop
  }

  addUri(suri: string, _password: string, meta: Record<string, unknown>) {
    return { pair: { address: `${suri}-address`, meta }, json: null };
  }

  forgetAccount(): void {
    // noop
  }

  forgetAddress(): void {
    // noop
  }
}

export { MockKeyring as Keyring };
