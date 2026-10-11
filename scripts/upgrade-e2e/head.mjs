// What the upgraded build is checked against in every scenario (web-keys.md §6.4, A0-A11): the popup's own screens,
// the background over the popup's port, a dApp page on localhost, and the stored records read back outside the browser.
import { Keyring } from '@polkadot/keyring';
import { u8aToHex, u8aWrapBytes } from '@polkadot/util';
import { cryptoWaitReady, decodeAddress, signatureVerify } from '@polkadot/util-crypto';
import { Address, Cell, loadMessage } from '@ton/core';
import { signVerify } from '@ton/crypto';
import { HDNodeWallet, Wallet, verifyMessage } from 'ethers';
import { cdp, devtools, sleep, waitFor } from './chrome.mjs';
import { scryptParamsOf } from './keyring-305.mjs';
import { EVM_PATH } from './secrets.mjs';

export class Report {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.checks = [];
    this.notes = [];
  }

  check(code, name, ok, details) {
    this.checks.push({ code, name, ok: !!ok, ...(details === undefined ? {} : { details }) });
    console.log(
      `[${this.id}] ${ok ? 'ok  ' : 'FAIL'} ${code} ${name}${details === undefined || ok ? '' : ` ${JSON.stringify(details)}`}`
    );
    return !!ok;
  }

  note(text) {
    this.notes.push(text);
    console.log(`[${this.id}] note ${text}`);
  }

  get ok() {
    return !this.error && this.checks.length > 0 && this.checks.every(({ ok }) => ok);
  }

  toJSON() {
    const failed = this.checks.filter(({ ok }) => !ok);
    return {
      id: this.id,
      title: this.title,
      ok: this.ok,
      passed: this.checks.length - failed.length,
      failed: failed.length,
      error: this.error,
      notes: this.notes,
      checks: this.checks,
    };
  }
}

// ---- Popup screens --------------------------------------------------------------------------------------------------

export async function typeInto(page, elementExpression, value) {
  await page.eval(
    `(() => { const el = ${elementExpression}; if (!el) throw new Error('nothing to type into'); el.focus(); el.select?.(); return true; })()`
  );
  await page.send('Input.insertText', { text: value });
  await sleep(300);
}

export const ui = (page) => ({
  hash: () => page.eval('location.hash'),
  waitHash: (pattern, label, ms = 30000) =>
    waitFor(async () => new RegExp(pattern).test(await page.eval('location.hash')), ms, label ?? pattern),
  exists: (selector) => page.eval(`!!document.querySelector(${JSON.stringify(selector)})`),
  text: (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? null`),
  // FButton puts data-testid on its wrapper; the handler sits on the button inside.
  click: (selector) =>
    page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('no ' + ${JSON.stringify(selector)});
      (el.matches('button, a, input') ? el : el.querySelector('button') ?? el).click(); return true; })()`),
  clickButton: (label) =>
    page.eval(
      `(() => { const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled); if (!el) throw new Error('no enabled button ' + ${JSON.stringify(label)}); el.click(); return true; })()`
    ),
  type: (selector, value) => typeInto(page, `document.querySelector(${JSON.stringify(selector)})`, value),
  goto: (hash) => page.eval(`location.hash = ${JSON.stringify(hash)}, true`),
});

export const WALLET_ROUTE = '^#/fearless/';

/** The unlock screen, as a user types the password. */
export async function unlockThroughUi(popup, password) {
  const page = ui(popup);
  await page.waitHash('unlock', 'the unlock screen');
  await page.type('.pass-block input', password);
  await page.click('.unlock-btn');
}

/** The 3.0.x security notice (WK-9): confirm, Continue, then "Later" in the guide, which returns to where the user was. */
export async function passSecurityNotice(popup) {
  const page = ui(popup);
  await page.waitHash('^#/security-notice', 'the security notice');
  await popup.eval('document.querySelector("[data-testid=securityNoticeConfirm] input").click(), true');
  await page.click('[data-testid="securityNoticeContinue"]');
  await page.waitHash('^#/security-notice/guide', 'the guide');
  await page.click('[data-testid="securityNoticeLater"]');
  await waitFor(async () => !/^#\/security-notice/.test(await page.hash()), 30000, 'leaving the notice');
}

// ---- Stored records -------------------------------------------------------------------------------------------------

const KEY_PREFIXES = ['fw:account:', 'fw:ton:', 'fw:keyring'];
const STATE_PREFIXES = [
  ...KEY_PREFIXES,
  'fw:archivedAccount:',
  'fw:deletedWallet:',
  'legacyExposure',
  'fwcurrent_account:',
];

export const keyEntries = (storage) =>
  Object.fromEntries(Object.entries(storage).filter(([key]) => KEY_PREFIXES.some((prefix) => key.startsWith(prefix))));
export const stateEntries = (storage) =>
  Object.fromEntries(
    Object.entries(storage)
      .filter(([key]) => STATE_PREFIXES.some((prefix) => key.startsWith(prefix)))
      .sort(([a], [b]) => a.localeCompare(b))
  );

/** A0: every key record the old build wrote is still there with byte-identical secrets. Metadata may grow. An ECDSA
 * record 4.2.0 moved from the account-id key to the public-key key (WK-8) counts when the moved copy is byte for byte
 * the old record and the old one is kept in its archive. */
export function compareKeyRecords(before, after) {
  const problems = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const archived = Object.entries(after)
    .filter(([key]) => key.startsWith('fw:archivedAccount:'))
    .flatMap(([, value]) => (value?.records ?? []).map(({ record }) => record));
  for (const [key, value] of Object.entries(keyEntries(before))) {
    const now = after[key];
    if (now === undefined) {
      const moved =
        key.startsWith('fw:account:') &&
        Object.entries(after).some(([other, record]) => other.startsWith('fw:account:') && same(record, value)) &&
        archived.some((record) => same(record, value));
      if (!moved) problems.push({ key, problem: 'missing' });
      continue;
    }
    for (const field of ['encoded', 'cipherSeed', 'passwordHash', 'address', 'publicKeyHex']) {
      if (value?.[field] !== undefined && !same(value[field], now?.[field]))
        problems.push({ key, problem: `${field} changed` });
    }
    if (value?.encoding && !same(value.encoding, now?.encoding)) problems.push({ key, problem: 'encoding changed' });
  }
  return problems;
}

export const isAt3xCost = (json) => JSON.stringify(scryptParamsOf(json)) === JSON.stringify({ N: 32768, p: 1, r: 8 });

// ---- Expected identities, derived here from the public test secrets -------------------------------------------------

let ready;
export async function cryptoReady() {
  ready ??= cryptoWaitReady();
  await ready;
}

export function substratePair(wallet) {
  const suri = wallet.kind === 'raw' ? wallet.seed : `${wallet.phrase}${wallet.path ?? ''}`;
  return new Keyring({ type: wallet.type ?? 'sr25519' }).addFromUri(suri, {}, wallet.type ?? 'sr25519');
}

export function ethereumPrivateKey(wallet) {
  if (wallet.evmPrivateKey) return wallet.evmPrivateKey.toLowerCase();
  const phrase = wallet.ethereumPhrase ?? wallet.phrase;
  return HDNodeWallet.fromPhrase(phrase, undefined, EVM_PATH.slice(1)).privateKey.toLowerCase();
}

export const ethereumAddressOf = (wallet) => new Wallet(ethereumPrivateKey(wallet)).address;

export function verifySubstrate(data, signature, address) {
  return signatureVerify(u8aWrapBytes(data), signature, address).isValid;
}

export function verifyEvm(message, signature, address) {
  try {
    return verifyMessage(message, signature).toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

/** Opens an exported JSON with the password, as a user restoring the file would, and returns its public key. */
export function openJson(json, password) {
  const type = json.encoding?.content?.[1] ?? 'sr25519';
  const pair = new Keyring({ type }).addFromJson(json);
  pair.decodePkcs8(password);
  return { publicKey: u8aToHex(pair.publicKey), address: pair.address };
}

export const publicKeyOf = (address) => u8aToHex(decodeAddress(address));

// ---- A dApp on localhost --------------------------------------------------------------------------------------------

/**
 * A3/A4: a dApp page asks the extension to sign; the request is authorized and approved from the popup's port, as the
 * popup's own approval screens do (messages.ts pri(authorize.approve), pri(signing.approve)). Returns the signature.
 */
export async function signThroughDapp({ port, popup, dappUrl, kind, address, message, authorizedAccounts }) {
  const target = await (await devtools(port, `/json/new?${dappUrl}`, { method: 'PUT' })).json();
  const page = cdp(target.webSocketDebuggerUrl);
  await page.ready;
  try {
    await waitFor(
      () => page.eval(`!!window.e2e && !!window.injectedWeb3?.['fearless-wallet']`),
      20000,
      'the injected wallet on the dApp page'
    );
    const id = `${kind}-${Date.now()}`;
    await page.eval(
      `window.e2e.${kind}(${JSON.stringify(id)}, ${JSON.stringify(address)}, ${JSON.stringify(message)}), true`
    );
    const started = Date.now();
    while (Date.now() - started < 60000) {
      const result = await page.eval(`window.e2eResults[${JSON.stringify(id)}]`);
      if (result && !result.pending) return result;
      for (const request of (await popup.call('pri(authorize.requests)')).ok ?? []) {
        await popup.call('pri(authorize.approve)', { id: request.id, authorizedAccounts });
      }
      const signing =
        kind === 'substrate'
          ? ((await popup.call('pri(signing.requests)')).ok ?? []).map(({ id: requestId }) => requestId)
          : Object.keys((await popup.call('pri(signing.evmRequests)')).ok ?? {});
      for (const requestId of signing) await popup.call('pri(signing.approve)', { id: requestId });
      await sleep(400);
    }
    return { err: 'timeout' };
  } finally {
    page.close();
    await devtools(port, `/json/close/${target.id}`).catch(() => undefined);
  }
}

/**
 * A6: a TON wallet v4 external message as the build sent it to TI: it is addressed to the sender's wallet, carries the
 * seqno TI reported, and its Ed25519 signature over the rest of the body verifies against the public key stored with
 * the account.
 */
export function verifyTonTransfer(boc, { from, publicKeyHex, seqno }) {
  try {
    const message = loadMessage(Cell.fromBase64(boc).beginParse());
    if (message.info.type !== 'external-in') return { ok: false, reason: message.info.type };
    const body = message.body.beginParse();
    const signature = body.loadBuffer(64);
    const signed = body.asCell();
    const fields = signed.beginParse();
    fields.loadUint(32); // subwallet id
    fields.loadUint(32); // valid until
    const sentSeqno = fields.loadUint(32);
    const valid = signVerify(signed.hash(), signature, Buffer.from(publicKeyHex, 'hex'));
    const to = message.info.dest.equals(Address.parse(from));
    return { ok: valid && to && sentSeqno === seqno, valid, to, seqno: sentSeqno };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) };
  }
}
