// The other side of a live WalletConnect smoke: a dApp, or the mobile wallet, running here in Node with its records in
// memory, against the real relay.
//
// By default it is this repository's own WalletConnect client (src/.../wallet-connect-service/protocol), bundled for
// Node. Set WALLETCONNECT_REFERENCE_SDK to a directory outside this repository where @walletconnect/sign-client and
// @walletconnect/utils are installed to run the same smoke against the SDK most dApps ship instead. That SDK is under
// the WalletConnect Community License, so it is never a dependency of this repository or part of the extension.

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const memoryStorage = () => {
  const values = new Map();

  return {
    getKeys: async () => [...values.keys()],
    getEntries: async () => [...values.entries()].map(([key, value]) => [key, JSON.parse(value)]),
    getItem: async (key) => (values.has(key) ? JSON.parse(values.get(key)) : undefined),
    setItem: async (key, value) => void values.set(key, JSON.stringify(value)),
    removeItem: async (key) => void values.delete(key),
  };
};

async function projectId(root) {
  const consts = await fs.readFile(
    path.join(root, 'src/extension/background/extension-base/src/services/wallet-connect-service/consts.ts'),
    'utf8'
  );

  return consts.match(/PROJECT_ID_EXTENSION = '([0-9a-f]+)'/)[1];
}

async function inRepoClient(root) {
  const { build } = await import('esbuild');
  const outfile = path.join(root, 'build/walletconnect-peer/client.mjs');

  await build({
    stdin: {
      contents: [
        "export { WalletConnectClient } from '@extension-base/services/wallet-connect-service/protocol/client';",
        "export { getSdkError } from '@extension-base/services/wallet-connect-service/protocol/errors';",
      ].join('\n'),
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    tsconfig: path.join(root, 'tsconfig.json'),
    outfile,
    logLevel: 'warning',
  });

  return import(`${pathToFileURL(outfile).href}?${Date.now()}`);
}

/**
 * Starts a peer. `proposals` lists the session proposals it sent, as the wallet received them. `kind` names which
 * client it is, for the report.
 */
export async function startWalletConnectPeer(root, name, description = 'WalletConnect smoke') {
  const metadata = { name, description, url: 'https://fearlesswallet.io/', icons: [] };
  const relayUrl = 'wss://relay.walletconnect.com';
  const reference = process.env.WALLETCONNECT_REFERENCE_SDK;

  if (reference) {
    const requireFrom = createRequire(path.join(path.resolve(reference), 'package.json'));
    const sdk = await import(pathToFileURL(requireFrom.resolve('@walletconnect/sign-client')).href);
    const { getSdkError } = await import(pathToFileURL(requireFrom.resolve('@walletconnect/utils')).href);
    const SignClient = sdk.SignClient ?? sdk.default?.SignClient ?? sdk.default;
    const manifest = path.join(path.resolve(reference), 'node_modules/@walletconnect/sign-client/package.json');
    const version = JSON.parse(await fs.readFile(manifest, 'utf8')).version;
    const client = await SignClient.init({ projectId: await projectId(root), relayUrl, metadata, storage: memoryStorage() });
    const proposals = [];
    const encode = client.core.crypto.encode.bind(client.core.crypto);

    client.core.crypto.encode = (topic, payload, options) => {
      if (payload?.method === 'wc_sessionPropose') proposals.push(structuredClone(payload.params));
      return encode(topic, payload, options);
    };

    return { client, kind: `WalletConnect SDK ${version}`, version, proposals, getSdkError, close: async () => client.core.relayer.transportClose() };
  }
  const { WalletConnectClient, getSdkError } = await inRepoClient(root);
  const client = await WalletConnectClient.init({
    projectId: await projectId(root),
    relayUrl,
    metadata,
    storage: memoryStorage(),
    userAgent: 'wc-2/fearless-wallet-smoke/node',
  });
  const proposals = [];
  const connect = client.connect.bind(client);

  client.connect = async (params) => {
    const result = await connect(params);
    const sent = client.record.sentProposals.at(-1)?.proposal;

    if (sent) proposals.push(structuredClone(sent));
    return result;
  };

  return { client, kind: 'Fearless in-repo client', version: 'in-repo', proposals, getSdkError, close: async () => client.close() };
}
