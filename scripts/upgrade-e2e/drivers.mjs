// What each released build's own UI sends to its background to create the wallets a scenario needs. The payloads are
// copied from that release's source, so the background writes exactly what it wrote for a user:
//   per-account password (1.3.1, 2.0.1, 2.6.3): AddWallet.vue saveKeypairFromSeed / saveKeypairFromJson,
//     `pri(accounts.create)` {password, suri, type, meta} (1d515acf messaging/accounts.ts:20);
//   2.7.1: the same without the password, the keyring encrypts with the master password (39541eb7);
//   3.0.x: {suri, type, meta, walletEcosystem}; TON with walletEcosystem 'ton' (600a64d5 AddWallet.vue:656-707).
// Every wallet is created Ethereum account first, then the Substrate account that names it, as the UI does.
import { EVM_PATH } from './secrets.mjs';

// 4.2.0 takes the 3.0.x payloads; R1 uses the same driver to write wallets with it.
const familyOf = (version) => (/^(3\.0|4\.)/.test(version) ? '3.0' : version === '2.7.1' ? '2.7' : 'per-account');

export function legacyDriver(popup, version) {
  const family = familyOf(version);
  const call = async (message, request) => {
    const result = await popup.call(message, request);
    if (result.err !== undefined) throw new Error(`${version} ${message}: ${result.err}`);
    return result.ok;
  };
  const expectTrue = async (message, request) => {
    const result = await call(message, request);
    if (result !== true) throw new Error(`${version} ${message} answered ${JSON.stringify(result)}`);
    return true;
  };
  const metaOf = (name) => (family === '3.0' ? { name, ethereumAddress: '', walletEcosystem: 'substrate' } : { name, ethereumAddress: '' });
  const create = (suri, type, meta, password) =>
    call(
      'pri(accounts.create)',
      family === 'per-account'
        ? { password, suri, type, meta }
        : family === '2.7'
          ? { suri, type, meta }
          : { suri, type, meta, walletEcosystem: meta.walletEcosystem ?? 'substrate' }
    );

  return {
    version,
    family,
    call,
    createMasterPassword: (newPassword) => expectTrue('pri(keyring.changePassword)', { newPassword }),
    changeMasterPassword: (oldPassword, newPassword) => expectTrue('pri(keyring.changePassword)', { oldPassword, newPassword }),
    unlock: (password) => expectTrue('pri(keyring.unlock)', { password }),
    /** 3.0.x migrates the account and then its linked Ethereum account with the same password; a different Ethereum
     * password leaves the Ethereum account behind and answers false (600a64d5 keyring-service/index.ts:512-527). */
    migrate: (address, password) => call('pri(keyring.migrateMasterPassword)', { address, password }),
    /** A new random phrase, as "Create wallet" shows it (3.0.x). */
    generateMnemonic: (walletEcosystem = 'substrate', wordCount = 12) => call('pri(keyring.generateMnemonic)', { walletEcosystem, wordCount }),

    async addMnemonicWallet({ name, phrase, password, type = 'sr25519', path = '', withEthereum = true }) {
      const meta = metaOf(name);
      if (withEthereum) meta.ethereumAddress = await create(`${phrase}${EVM_PATH}`, 'ethereum', { ...meta }, password);
      const address = await create(`${phrase}${path}`, type, meta, password);
      return { name, kind: 'mnemonic', type, address, ethereumAddress: meta.ethereumAddress, phrase, path, password };
    },

    async addRawSeedWallet({ name, seed, evmPrivateKey, password }) {
      const meta = metaOf(name);
      if (evmPrivateKey) meta.ethereumAddress = await create(evmPrivateKey, 'ethereum', { ...meta }, password);
      const address = await create(seed, 'sr25519', meta, password);
      return { name, kind: 'raw', type: 'sr25519', address, ethereumAddress: meta.ethereumAddress, seed, evmPrivateKey, password };
    },

    /** A polkadot-js JSON file, with its own password; 3.0.x renames it after the selected wallet when it has no name. */
    async restoreJsonWallet({ substrate, ethereum }) {
      let ethereumAddress = '';
      if (ethereum) ethereumAddress = await call('pri(accounts.json.restore)', { file: structuredClone(ethereum.json), password: ethereum.password });
      const file = structuredClone(substrate.json);
      file.meta =
        family === '3.0'
          ? { name: file.meta?.name, whenCreated: file.meta?.whenCreated ?? Date.now(), walletEcosystem: 'substrate', ethereumAddress }
          : { ...file.meta, ethereumAddress };
      const address = await call('pri(accounts.json.restore)', { file, password: substrate.password });
      return {
        name: file.meta.name,
        kind: 'json',
        type: substrate.json.encoding.content[1],
        address,
        ethereumAddress,
        password: substrate.password,
        ethereumPassword: ethereum?.password,
        phrase: substrate.phrase,
        ethereumPhrase: ethereum?.phrase,
      };
    },

    /** An Ethereum JSON file restored on its own: an Ethereum account no Substrate account names. */
    async restoreStandaloneEthereum({ json, password, phrase, name }) {
      const address = await call('pri(accounts.json.restore)', { file: structuredClone(json), password });
      return { name, kind: 'json-ethereum', type: 'ethereum', address: '', ethereumAddress: address, ethereumPassword: password, ethereumPhrase: phrase, standalone: true };
    },

    /** "Add Ethereum account" to the selected wallet (AddWallet.vue isOnlyEthereumAccount). */
    async addEthereumToWallet(wallet, phrase) {
      const ethereumAddress = await create(`${phrase}${EVM_PATH}`, 'ethereum', { ...metaOf(wallet.name) }, wallet.password);
      await call('pri(accounts.update.meta)', { address: wallet.address, meta: { ethereumAddress } });
      return { ...wallet, ethereumAddress, ethereumPhrase: phrase };
    },

    async addTonWallet({ name, phrase }) {
      if (family !== '3.0') throw new Error(`${version} has no TON`);
      const address = await call('pri(accounts.create)', {
        suri: phrase,
        type: 'sr25519',
        meta: { name, ethereumAddress: '', walletEcosystem: 'ton' },
        walletEcosystem: 'ton',
      });
      return { name, kind: 'ton', walletEcosystem: 'ton', address, phrase };
    },

    setCurrentAccount: (address, walletEcosystem = 'substrate') =>
      call('pri(accounts.update.current)', family === '3.0' ? { address, walletEcosystem } : address),
    resetWallet: () => expectTrue('pri(keyring.reset)'),
    accounts: () => call('pri(accounts.subscribe)'),
  };
}

/** A polkadot-js JSON file as 3.0.x exports it: written by the 3.0.5 keyring itself (keyring-305.mjs), at N = 2^15. */
export function legacyJsonFile(legacy, { phrase, path = '', type = 'sr25519', name, password }) {
  const suri = type === 'ethereum' ? `${phrase}${EVM_PATH}` : `${phrase}${path}`;
  const pair = new legacy.Keyring({ type }).addFromUri(suri, { name, whenCreated: 1700000000000 }, type);
  return { json: pair.toJson(password), password, phrase, address: pair.address };
}
