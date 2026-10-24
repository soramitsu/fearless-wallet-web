// Assertions A0-A10 (web-keys.md §6.4) on the upgraded build, shared by every scenario. A scenario describes the
// profile its released build wrote (`profile`) and calls these in order.
import { sleep, waitFor } from './chrome.mjs';
import {
  compareKeyRecords,
  ethereumAddressOf,
  ethereumPrivateKey,
  isAt3xCost,
  openJson,
  passSecurityNotice,
  signThroughDapp,
  stateEntries,
  substratePair,
  ui,
  unlockThroughUi,
  verifyEvm,
  verifySubstrate,
  verifyTonTransfer,
  WALLET_ROUTE,
} from './head.mjs';

const lower = (value) => String(value ?? '').toLowerCase();

/**
 * profile = {
 *   master,            // the master password the upgraded build unlocks with (after the scenario's own steps)
 *   wallets: [{ name, address, type, ethereumAddress, kind, phrase?, path?, seed?, evmPrivateKey?, ethereumPhrase?,
 *               phraseStored? }],
 *   standalone: [{ ethereumAddress, ethereumPhrase?, evmPrivateKey? }],   // Ethereum accounts no wallet names
 *   ton: [{ name, address, phrase }],
 * }
 */

/** A0 at the first start of the upgraded build, before anyone touched it. */
export function checkFirstStart(r, before, after) {
  const problems = compareKeyRecords(before, after);
  r.check(
    'A0',
    'every key record the released build wrote is still stored, secrets byte for byte',
    problems.length === 0,
    problems
  );
}

/** A1: where the popup opens after the update. */
export async function checkLandingRoute(r, popup, expected) {
  const route = await waitFor(
    async () => {
      const hash = await popup.eval('location.hash');
      return /^#\/(unlock|migration-description|onboarding)/.test(hash) ? hash : undefined;
    },
    30000,
    'the first screen'
  ).catch(() => popup.eval('location.hash'));
  r.check(
    'A1',
    `the popup opens on ${expected}, a screen with a way forward`,
    new RegExp(`^#/${expected}`).test(route),
    route
  );
  return route;
}

/** A1: unlock through the popup, pass the 3.0.x security notice when it comes, and reach the wallet. */
export async function unlockToWallet(r, popup, { master, expectNotice }) {
  await unlockThroughUi(popup, master);
  const page = ui(popup);
  const first = await waitFor(
    async () => {
      const hash = await page.hash();
      return /^#\/(security-notice|fearless\/|migration)/.test(hash) ? hash : undefined;
    },
    30000,
    'the screen after unlock'
  );
  r.check(
    'A1',
    `after unlock: ${expectNotice ? 'the security notice for 3.0.x wallets' : 'the wallet'}`,
    expectNotice ? /^#\/security-notice/.test(first) : !/^#\/security-notice/.test(first),
    first
  );
  if (/^#\/security-notice/.test(first)) await passSecurityNotice(popup);
  const reached = await page.waitHash(WALLET_ROUTE, 'the wallet').then(
    () => true,
    () => false
  );
  r.check('A1', 'the scripted path reaches the wallet', reached, await page.hash());
}

/** A2: the right password unlocks, a wrong one does not, and neither changes the stored hash. */
export async function checkUnlock(r, session, popup, master) {
  const hashBefore = (await session.storage())['fw:keyring']?.passwordHash;
  await popup.call('pri(keyring.lock)', true);
  const wrong = (await popup.call('pri(keyring.unlock)', { password: `${master}!` })).ok;
  const right = (await popup.call('pri(keyring.unlock)', { password: master })).ok;
  const hashAfter = (await session.storage())['fw:keyring']?.passwordHash;
  r.check('A2', 'a wrong password does not unlock', wrong !== true, wrong);
  r.check('A2', 'the master password unlocks', right === true, right);
  r.check('A2', 'the stored password hash is unchanged', !!hashBefore && hashBefore === hashAfter);
}

/** A3/A4: every Substrate and Ethereum account of the profile signs through a dApp, with the original key. */
export async function checkDappSigning(r, ctx, session, popup, profile) {
  const accounts = (await popup.call('pri(accounts.subscribe)')).ok ?? [];
  const authorizedAccounts = accounts.flatMap(({ address, ethereumAddress }) =>
    [address, ethereumAddress].filter(Boolean)
  );
  const message = `Fearless upgrade E2E ${r.id}`;
  for (const wallet of profile.wallets.filter(({ address, pending }) => address && !pending)) {
    const result = await signThroughDapp({
      port: session.port,
      popup,
      dappUrl: ctx.dappUrl,
      kind: 'substrate',
      address: wallet.address,
      message,
      authorizedAccounts,
    });
    const original = substratePair(wallet);
    r.check(
      'A3',
      `${wallet.name}: a dApp signRaw verifies against the original ${wallet.type} key`,
      !!result.ok &&
        original.address === wallet.address &&
        verifySubstrate(message, result.ok.signature, original.address),
      result.err ?? result.ok?.signature
    );
  }
  const evmAccounts = [...profile.wallets, ...(profile.standalone ?? [])].filter(
    ({ ethereumAddress, ethereumPending }) => ethereumAddress && !ethereumPending
  );
  for (const wallet of evmAccounts) {
    const selected = accounts.find((account) => lower(account.ethereumAddress) === lower(wallet.ethereumAddress));
    if (!selected) throw new Error(`No wallet owns the original Ethereum account ${wallet.ethereumAddress}`);
    const result = await signThroughDapp({
      port: session.port,
      popup,
      dappUrl: ctx.dappUrl,
      kind: 'evm',
      address: wallet.ethereumAddress,
      message,
      authorizedAccounts: [selected.address],
    });
    r.check(
      'A4',
      `${wallet.name ?? wallet.ethereumAddress}: personal_sign recovers the original Ethereum address`,
      !!result.ok &&
        lower(ethereumAddressOf(wallet)) === lower(wallet.ethereumAddress) &&
        verifyEvm(message, result.ok.signature, wallet.ethereumAddress),
      result.err ?? result.ok?.signature
    );
  }
}

/** A5: the phrase, the Ethereum key and the JSON file the upgraded build exports are the original ones. */
export async function checkExports(r, popup, profile) {
  const master = profile.master;
  for (const wallet of profile.wallets.filter(({ address, pending }) => address && !pending)) {
    const mnemonic = await popup.call('pri(keyring.export.mnemonic)', {
      address: wallet.address,
      password: master,
      walletEcosystem: 'substrate',
    });
    const seed = mnemonic.ok?.seed;
    if (wallet.phraseStored) {
      r.check(
        'A5',
        `${wallet.name}: the exported recovery phrase is the original`,
        seed === wallet.phrase,
        mnemonic.err ?? seed
      );
    } else {
      // The released build kept no phrase for this account (raw seed, JSON file, 2.x keyring): never a different one.
      r.check(
        'A5',
        `${wallet.name}: no phrase was stored, and none other is exported`,
        !seed || seed === wallet.phrase,
        mnemonic.err ?? seed
      );
    }
    const exported = await popup.call('pri(accounts.export.json)', { address: wallet.address, password: master });
    const json = exported.ok?.json;
    const opened =
      json &&
      (() => {
        try {
          return openJson(json, master);
        } catch (error) {
          return { error: String(error?.message ?? error) };
        }
      })();
    r.check(
      'A5',
      `${wallet.name}: the JSON export opens with the master password to the original public key, at N = 2^15`,
      // The address names the key for every type (an ECDSA address is the hash of the public key).
      !!opened?.address && opened.address === wallet.address && isAt3xCost(json),
      exported.err ?? opened?.error
    );
  }
  for (const wallet of [...profile.wallets, ...(profile.standalone ?? [])].filter(
    ({ ethereumAddress, ethereumPending }) => ethereumAddress && !ethereumPending
  )) {
    const exported = await popup.call('pri(keyring.export.rowSeed)', {
      address: wallet.ethereumAddress,
      password: master,
      isEVM: true,
    });
    r.check(
      'A5',
      `${wallet.name ?? wallet.ethereumAddress}: the exported Ethereum private key is the original`,
      lower(exported.ok?.seed) === ethereumPrivateKey(wallet),
      exported.err ?? 'different key'
    );
  }
}

/** A6: every TON phrase exports exactly as it was typed. */
export async function checkTonExports(r, popup, profile, password = profile.master) {
  for (const wallet of profile.ton ?? []) {
    const exported = await popup.call('pri(keyring.export.mnemonic)', {
      address: wallet.address,
      password,
      walletEcosystem: 'ton',
    });
    r.check(
      'A6',
      `${wallet.name}: the TON phrase exports exactly as stored`,
      exported.ok?.seed === wallet.phrase,
      exported.err ?? exported.ok
    );
  }
}

/** The seqno the TI stand-in reports (mock-services.mjs runGetMethod). */
const MOCK_TON_SEQNO = 7;

/**
 * A6: each TON wallet sends 0.1 TON through the TI stand-in (the build reads the wallet state from it and sends through
 * it); the recorded message is signed with the key stored for that account.
 */
export async function checkTonTransfers(r, ctx, session, popup, profile) {
  const wallets = profile.ton ?? [];
  if (!wallets.length) return;
  const networks = Object.values((await popup.call('pri(networkMap.getSubscription)')).ok ?? {});
  const ton = networks.find(({ ecosystem, chainId }) => ecosystem === 'ton' && String(chainId) === '-239');
  if (
    !r.check(
      'A6',
      'the TON mainnet network is known (registry stand-in)',
      !!ton,
      networks.map(({ name }) => name)
    )
  )
    return;
  const storage = await session.storage();
  for (const wallet of wallets) {
    const sentBefore = ctx.mocks.sent.length;
    const request = {
      networkKey: ton.name,
      from: wallet.address,
      to: wallets[0].address,
      amount: '0.1',
      assetId: ton.assets[0].id,
    };
    // Balances arrive from TI shortly after unlock; until then the transfer has nothing to read.
    const result = await waitFor(
      async () => {
        const answer = await popup.call('pri(accounts.makeTransfer)', request);
        return answer.ok?.status === true || ctx.mocks.sent.length > sentBefore ? answer : undefined;
      },
      45000,
      `the TON transfer of ${wallet.name}`
    ).catch((error) => ({ err: String(error?.message ?? error) }));
    const sent = ctx.mocks.sent.slice(sentBefore).at(-1);
    const verified =
      sent &&
      verifyTonTransfer(sent.boc, {
        from: wallet.address,
        publicKeyHex: storage[`fw:ton:${wallet.address}`]?.publicKeyHex,
        seqno: MOCK_TON_SEQNO,
      });
    r.check(
      'A6',
      `${wallet.name}: a TON transfer is signed with the stored key and sent through the verified provider`,
      !!verified?.ok,
      result.err ?? verified
    );
  }
}

/** A10: closing and opening the upgraded build (and unlocking) three times leaves the stored state as it was. */
export async function checkStable(r, session, master) {
  const snapshots = [];
  for (let i = 0; i < 3; i++) {
    await session.restart();
    const popup = await session.popup();
    await popup.call('pri(keyring.unlock)', { password: master });
    await sleep(3000);
    snapshots.push(JSON.stringify(stateEntries(await session.storage())));
  }
  r.check(
    'A10',
    'three restarts with unlock leave keys, archives, notice record and current account unchanged',
    snapshots.every((snapshot) => snapshot === snapshots[0])
  );
}

/** A9: the first messages after a cold start see the stored master password and a locked keyring. */
export async function checkColdStarts(r, session, count, expected) {
  const runs = await session.coldStarts(count);
  const wrong = runs.filter(
    (run) =>
      run.error ||
      run.hasMasterPassword !== expected.hasMasterPassword ||
      run.keyringIsLocked !== expected.keyringIsLocked ||
      run.hasAccounts !== true
  );
  r.check(
    'A9',
    `${count} cold starts: the first answers are hasMasterPassword=${expected.hasMasterPassword}, locked=${expected.keyringIsLocked}, accounts present`,
    wrong.length === 0,
    wrong.slice(0, 3)
  );
  await session.launch();
}

/** The current account after the upgrade is one the profile holds and is not an Ethereum-only account (W10). */
export async function checkCurrentAccount(r, session, profile, expectedAddress) {
  const current = (await session.storage())['fwcurrent_account:CurrentAccountInfo'];
  const known = profile.wallets.map(({ address }) => address).concat((profile.ton ?? []).map(({ address }) => address));
  const ok = expectedAddress ? current?.address === expectedAddress : known.includes(current?.address);
  r.check(
    'W10',
    `the current account is ${expectedAddress ? `still ${expectedAddress}` : 'a wallet of the profile'}`,
    ok,
    current
  );
}
