#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Published 3.0.1 and 3.0.3-3.0.5 sent recovery phrases to `${host}/whitelist?address=...`, and the
// host the remote switch named was tonscanner. Neither may appear in a release, whatever the
// allowlist says: the host came from remote configuration, so no host check would have caught it.
export const FORBIDDEN_BUNDLE_STRINGS = Object.freeze(['whitelist?address', 'tonscanner']);

/**
 * The development chain list and feature config (src/consts/urls.ts). A bundle compiled without NODE_ENV=production
 * reads them instead of the production ones, as the popup of a bare `--mode production` build did until every bundle
 * of a build got one NODE_ENV (resolveBuildNodeEnv in vite.config.shared.mjs): it showed test networks and test
 * configuration while its worker used production. A release bundle names neither.
 */
export const DEVELOPMENT_CONFIG_PATHS = Object.freeze([
  '/development/chains/v13/chains_dev.json',
  '/development/appConfigs/web_config.json',
]);

export const DEFAULT_ALLOWLIST_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'release-network-hosts.json'
);

const TEXT_FILE = /\.(?:c?js|mjs|html|css|json|svg|txt|webmanifest|xml)$/iu;

// A literal URL with a scheme the bundle could contact or link to: http(s), ws(s). JSON escapes the
// slashes. A host built at run time (`https://${host}`) has no literal host and is not matched; the
// forbidden strings above are what catches the known one.
const URL_HOST = /\b(?:https?|wss?):(?:\\?\/){2}((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[[0-9a-f:.]+\])/giu;

function fail(message) {
  throw new Error(message);
}

export function extractNetworkHosts(text) {
  const hosts = new Set();

  for (const match of text.matchAll(URL_HOST)) hosts.add(match[1].toLowerCase());

  return hosts;
}

export function parseHostAllowlist(document, label = 'host allowlist') {
  if (!document || typeof document !== 'object' || Array.isArray(document)) fail(`${label} must be a JSON object`);
  if (document.format !== 'fearless-release-network-hosts' || document.version !== 1) {
    fail(`${label} must declare format "fearless-release-network-hosts" version 1`);
  }
  if (!Array.isArray(document.groups) || document.groups.length === 0) fail(`${label} must list groups`);

  const hosts = new Map();

  for (const [index, group] of document.groups.entries()) {
    const where = `${label} group ${index}`;

    if (typeof group?.reason !== 'string' || group.reason.trim() === '') fail(`${where} needs a reason`);
    if (!Array.isArray(group.hosts) || group.hosts.length === 0) fail(`${where} must list hosts`);

    for (const host of group.hosts) {
      if (typeof host !== 'string' || ![...extractNetworkHosts(`https://${host}/`)].includes(host)) {
        fail(`${where} has an invalid host ${JSON.stringify(host)}; hosts are exact lower-case names, no wildcards`);
      }
      if (hosts.has(host)) fail(`${label} lists ${host} twice`);
      if (FORBIDDEN_BUNDLE_STRINGS.some((forbidden) => host.includes(forbidden))) {
        fail(`${label} may not allow ${host}`);
      }

      hosts.set(host, group.reason);
    }
  }

  return hosts;
}

export async function readHostAllowlist(allowlistPath = DEFAULT_ALLOWLIST_PATH) {
  let document;

  try {
    document = JSON.parse(await fs.readFile(allowlistPath, 'utf8'));
  } catch (error) {
    fail(`cannot read host allowlist ${allowlistPath}: ${error.message}`);
  }

  return parseHostAllowlist(document, path.basename(allowlistPath));
}

/**
 * Every network host the text files name, with the files naming it, every forbidden string found, and every text file
 * that names the development configuration.
 */
export function collectBundleHosts(files) {
  const hosts = new Map();
  const forbidden = [];
  const developmentConfig = [];

  for (const [name, content] of files) {
    // Binary files are searched too: a string hidden in WASM or an image is still in the package.
    const lowered = content.toString('latin1').toLowerCase();

    for (const needle of FORBIDDEN_BUNDLE_STRINGS) {
      if (lowered.includes(needle)) forbidden.push(`${name}: ${needle}`);
    }

    if (!TEXT_FILE.test(name)) continue;

    const text = content.toString('utf8');

    for (const configPath of DEVELOPMENT_CONFIG_PATHS) {
      if (text.includes(configPath)) developmentConfig.push(`${name}: ${configPath}`);
    }

    for (const host of extractNetworkHosts(text)) {
      if (!hosts.has(host)) hosts.set(host, new Set());
      hosts.get(host).add(name);
    }
  }

  return { hosts, forbidden, developmentConfig };
}

/**
 * Fails when any file contains a forbidden string, a text file names the development configuration, or a text file
 * names a network host outside `allowedHosts`. `files` maps artifact paths to their bytes, as the Chrome release audit
 * reads them. Returns every host found with the files that name it.
 */
export function auditBundleHosts(files, allowedHosts, label = 'bundle') {
  const { hosts, forbidden, developmentConfig } = collectBundleHosts(files);

  if (forbidden.length) {
    fail(`${label} contains strings of the 3.0.x phrase upload: ${forbidden.join('; ')}`);
  }

  if (developmentConfig.length) {
    fail(
      `${label} reads the development configuration, so it was built without NODE_ENV=production: ` +
        `${developmentConfig.join('; ')}`
    );
  }

  const unknown = [...hosts.keys()].filter((host) => !allowedHosts.has(host)).sort();

  if (unknown.length) {
    const detail = unknown.map((host) => `${host} (${[...hosts.get(host)].sort().join(', ')})`).join('; ');
    fail(
      `${label} names network hosts outside scripts/release-network-hosts.json: ${detail}. ` +
        'Review each host and add it with a reason, or remove it from the bundle.'
    );
  }

  return hosts;
}

async function readDirectory(root) {
  const files = new Map();

  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);

      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.set(path.relative(root, absolute).split(path.sep).join('/'), await fs.readFile(absolute));
    }
  }

  await visit(root);

  return files;
}

function usage() {
  return `Usage: node scripts/audit-bundle-hosts.mjs --dist DIR [--allowlist FILE] [--list]

Fails when the built bundle in DIR contains ${FORBIDDEN_BUNDLE_STRINGS.map((value) => JSON.stringify(value)).join(' or ')},
reads the development chain list or feature config (a bundle built without NODE_ENV=production), or names a network
host that scripts/release-network-hosts.json does not list. --list prints every host found.`;
}

function parseArguments(argv) {
  const options = { allowlistPath: DEFAULT_ALLOWLIST_PATH, distDir: '', list: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--list') {
      options.list = true;
      continue;
    }
    if (argument === '--dist' || argument === '--allowlist') {
      const value = argv[index + 1];

      if (!value || value.startsWith('--')) fail(`${argument} requires a path`);
      options[argument === '--dist' ? 'distDir' : 'allowlistPath'] = path.resolve(value);
      index += 1;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }

  if (!options.distDir) fail('--dist is required');

  return options;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));

    if (options.help) {
      console.log(usage());
      return;
    }

    const files = await readDirectory(options.distDir);

    if (options.list) {
      const { hosts, forbidden, developmentConfig } = collectBundleHosts(files);

      for (const [host, names] of [...hosts].sort(([left], [right]) => left.localeCompare(right))) {
        console.log(`${host}\t${[...names].sort().join(',')}`);
      }
      for (const entry of forbidden) console.log(`FORBIDDEN\t${entry}`);
      for (const entry of developmentConfig) console.log(`DEVELOPMENT_CONFIG\t${entry}`);
      return;
    }

    const found = auditBundleHosts(files, await readHostAllowlist(options.allowlistPath), options.distDir);

    console.log(
      `Bundle host audit passed: ${files.size} files; ${found.size} allowed hosts; no 3.0.x upload strings; ` +
        'no development configuration'
    );
  } catch (error) {
    console.error(`Bundle host audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
