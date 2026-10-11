// Shared settings of the upgrade E2E (tests/upgrade/README.md).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 3.0.x refuses to load a manifest whose oauth2 entry has no client id; every test build gets this placeholder. */
export const TEST_OAUTH_CLIENT_ID = '000000000000-fearless-upgrade-test.apps.googleusercontent.com';

/** The public half of a throwaway RSA key. Every build carries it, so all share one extension id and storage. To run
 * under the store's extension id instead, set UPGRADE_E2E_EXTENSION_KEY to the production public key (base64). */
export const testExtensionKey = () =>
  process.env.UPGRADE_E2E_EXTENSION_KEY ||
  readFileSync(path.join(root, 'tests/upgrade/test-extension-key.pub.b64'), 'utf8').trim();

export const cacheRoot = () => process.env.UPGRADE_E2E_CACHE || path.join(homedir(), '.cache', 'fearless-upgrade-e2e');

export const legacyBuilds = () =>
  JSON.parse(readFileSync(path.join(root, 'tests/upgrade/legacy-builds.json'), 'utf8')).builds;
