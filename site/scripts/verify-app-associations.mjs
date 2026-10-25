import fs from 'node:fs';
import path from 'node:path';

const ANDROID_PACKAGE = 'jp.co.soramitsu.fearless';
const ANDROID_RELEASE_CERT_SHA256 =
  'CC:17:CB:D4:30:43:22:C5:8E:27:89:03:45:E6:00:9B:28:17:B7:7E:A2:3D:85:FF:DB:E3:33:8C:57:F3:62:C3';
const ANDROID_RELATIONS = [
  'delegate_permission/common.get_login_creds',
  'delegate_permission/common.handle_all_urls',
];
const IOS_APPLICATION_IDS = [
  'YLWWUD25VZ.jp.co.soramitsu.fearlesswallet',
  'YLWWUD25VZ.jp.co.soramitsu.fearlesswallet.dev',
];
const ASSOCIATION_PATHS = [
  '.well-known/assetlinks.json',
  '.well-known/apple-app-site-association',
  '.well-known/apple-app-site-association.json',
];
const MAX_ASSOCIATION_BYTES = 64 * 1024;

const options = parseArgs(process.argv.slice(2));
const root = path.resolve(options.root ?? process.cwd());
const sourceAssociations = new Map();
let failures = 0;

for (const relativePath of ASSOCIATION_PATHS) {
  const file = path.join(root, 'src/public', relativePath);

  try {
    const value = parseJson(readAssociationFile(file), file);

    validateAssociation(relativePath, value, `source:${relativePath}`);
    sourceAssociations.set(relativePath, value);
  } catch (error) {
    reportFailure(error);
  }
}

if (options.liveBaseUrl) {
  const baseUrl = normalizeLiveBaseUrl(options.liveBaseUrl);

  for (const relativePath of ASSOCIATION_PATHS) {
    const url = new URL(relativePath, `${baseUrl}/`).toString();

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      const contentType = response.headers.get('content-type') ?? '';
      const contentLength = response.headers.get('content-length');
      const routeFailures = [];

      if (response.status !== 200) {
        routeFailures.push(`live:${relativePath}: expected HTTP 200, received ${response.status}`);
      }
      if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/iu.test(contentType)) {
        routeFailures.push(`live:${relativePath}: expected JSON content-type, received ${contentType || '<missing>'}`);
      }
      if (response.headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
        routeFailures.push(`live:${relativePath}: X-Content-Type-Options must be nosniff`);
      }
      if (contentLength !== null) {
        if (!/^(?:0|[1-9]\d*)$/u.test(contentLength)) {
          routeFailures.push(`live:${relativePath}: malformed Content-Length header`);
        } else if (Number(contentLength) > MAX_ASSOCIATION_BYTES) {
          routeFailures.push(`live:${relativePath}: response exceeds ${MAX_ASSOCIATION_BYTES} bytes`);
        }
      }
      let body;
      try {
        body = await readBoundedResponseBody(response, `live:${relativePath}`);
      } catch (error) {
        routeFailures.push(error instanceof Error ? error.message : String(error));
      }
      if (body !== undefined) {
        let liveValue;
        try {
          liveValue = parseJson(body, url);
          validateAssociation(relativePath, liveValue, `live:${relativePath}`);
        } catch (error) {
          routeFailures.push(error instanceof Error ? error.message : String(error));
        }
        if (liveValue !== undefined) {
          const sourceValue = sourceAssociations.get(relativePath);
          if (sourceValue === undefined) {
            routeFailures.push(`live:${relativePath}: source contract is unavailable`);
          } else if (stableJson(liveValue) !== stableJson(sourceValue)) {
            routeFailures.push(`live:${relativePath}: deployed JSON does not match the source contract`);
          }
        }
      }
      if (routeFailures.length > 0) throw new Error(routeFailures.join('\n'));
      console.log(`Live association verified: ${url} (${contentType})`);
    } catch (error) {
      reportFailure(error);
    }
  }
}

if (failures) process.exit(1);

console.log(
  `App association verification passed for Android ${ANDROID_PACKAGE} and iOS ${IOS_APPLICATION_IDS.join(', ')}.`
);

function validateAssociation(relativePath, value, label) {
  if (relativePath.endsWith('assetlinks.json')) validateAssetLinks(value, label);
  else validateAppleAssociation(value, label, relativePath.endsWith('.json'));
}

function validateAssetLinks(value, label) {
  assert(Array.isArray(value), `${label}: root must be an array`);
  assert(value.length === 1, `${label}: expected exactly one Android application statement`);

  const statement = requireRecord(value[0], `${label}[0]`);
  assertExactKeys(statement, ['relation', 'target'], `${label}[0]`);
  const target = requireRecord(statement.target, `${label}[0].target`);
  assertExactKeys(
    target,
    ['namespace', 'package_name', 'sha256_cert_fingerprints'],
    `${label}[0].target`
  );
  const relations = requireStringArray(statement.relation, `${label}[0].relation`);
  const fingerprints = requireStringArray(
    target.sha256_cert_fingerprints,
    `${label}[0].target.sha256_cert_fingerprints`
  );

  assert(target.namespace === 'android_app', `${label}: target namespace must be android_app`);
  assert(target.package_name === ANDROID_PACKAGE, `${label}: Android package mismatch`);
  assertSameSet(relations, ANDROID_RELATIONS, `${label}: Android relations mismatch`);
  assert(fingerprints.length === 1, `${label}: expected exactly one release signing fingerprint`);
  assert(
    /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u.test(fingerprints[0]),
    `${label}: malformed SHA-256 certificate fingerprint`
  );
  assert(
    fingerprints[0] === ANDROID_RELEASE_CERT_SHA256,
    `${label}: Android release signing fingerprint mismatch`
  );
}

function validateAppleAssociation(value, label, isJsonAlias) {
  const rootValue = requireRecord(value, label);
  assertExactKeys(rootValue, ['applinks', 'webcredentials'], label);
  const applinks = requireRecord(rootValue.applinks, `${label}.applinks`);
  assertExactKeys(applinks, isJsonAlias ? ['details'] : ['apps', 'details'], `${label}.applinks`);
  assert(Array.isArray(applinks.details) && applinks.details.length > 0, `${label}: applinks.details is required`);

  if (isJsonAlias) {
    assert(applinks.details.length === 1, `${label}: expected exactly one /ton-connect applink detail`);
  } else {
    assert(
      Array.isArray(applinks.apps) && applinks.apps.length === 0,
      `${label}: existing empty applinks.apps array must be preserved`
    );
    assert(applinks.details.length === IOS_APPLICATION_IDS.length, `${label}: wildcard applink details mismatch`);
  }

  const appIds = applinks.details.flatMap((item, index) => {
    const detail = requireRecord(item, `${label}.applinks.details[${index}]`);
    assertExactKeys(
      detail,
      isJsonAlias ? ['appIDs', 'components'] : ['appID', 'paths'],
      `${label}.applinks.details[${index}]`
    );
    assert(
      (detail.appID === undefined) !== (detail.appIDs === undefined),
      `${label}.applinks.details[${index}]: exactly one of appID or appIDs is required`
    );
    const ids = detail.appIDs === undefined
      ? [requireString(detail.appID, `${label}.applinks.details[${index}].appID`)]
      : requireStringArray(detail.appIDs, `${label}.applinks.details[${index}].appIDs`);

    if (isJsonAlias) {
      assert(detail.appID === undefined, `${label}: JSON alias must use appIDs`);
      assert(Array.isArray(detail.components) && detail.components.length === 1, `${label}: applink components mismatch`);
      const component = requireRecord(detail.components[0], `${label}.applinks.details[${index}].components[0]`);
      assert(
        component['/'] === '/ton-connect',
        `${label}: /ton-connect applink component is required`
      );
      assert(
        Object.keys(component).every((key) => key === '/' || key === 'comment'),
        `${label}: /ton-connect applink component contains unsupported match conditions`
      );
    } else {
      assert(detail.appIDs === undefined, `${label}: extensionless association must use appID`);
      assert(
        Array.isArray(detail.paths) && detail.paths.length === 1 && detail.paths[0] === '*',
        `${label}: existing wildcard applink path must be preserved`
      );
    }

    return ids;
  });
  const webcredentials = requireRecord(rootValue.webcredentials, `${label}.webcredentials`);
  assertExactKeys(webcredentials, ['apps'], `${label}.webcredentials`);
  const credentialApps = requireStringArray(webcredentials.apps, `${label}.webcredentials.apps`);

  assertSameSet(appIds, IOS_APPLICATION_IDS, `${label}: applinks application identifiers mismatch`);
  assertSameSet(
    credentialApps,
    IOS_APPLICATION_IDS,
    `${label}: webcredentials application identifiers mismatch`
  );
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--root' || arg === '--live-base-url') {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      parsed[arg === '--root' ? 'root' : 'liveBaseUrl'] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function normalizeLiveBaseUrl(value) {
  const url = new URL(value);
  assert(url.protocol === 'https:', 'Live association base URL must use HTTPS');
  assert(Boolean(url.hostname), 'Live association base URL must include a hostname');
  assert(!url.username && !url.password, 'Live association base URL must not contain credentials');
  assert(url.pathname === '/' && !url.search && !url.hash, 'Live association base URL must not include a path, query, or fragment');

  return url.toString().replace(/\/$/u, '');
}

function readAssociationFile(file) {
  const stat = fs.lstatSync(file);

  assert(stat.isFile() && !stat.isSymbolicLink(), `${file}: association source must be a regular file`);
  assert(stat.size <= MAX_ASSOCIATION_BYTES, `${file}: source exceeds ${MAX_ASSOCIATION_BYTES} bytes`);

  return fs.readFileSync(file, 'utf8');
}

async function readBoundedResponseBody(response, label) {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_ASSOCIATION_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`${label}: response exceeds ${MAX_ASSOCIATION_BYTES} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, byteLength).toString('utf8');
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

function requireRecord(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);

  return value;
}

function requireString(value, label) {
  assert(
    typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\u0000-\u001F\u007F]/u.test(value),
    `${label} must be a non-empty canonical string`
  );

  return value;
}

function requireStringArray(value, label) {
  assert(Array.isArray(value), `${label} must be a string array`);
  value.forEach((item, index) => requireString(item, `${label}[${index}]`));

  return value;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();

  assert(
    actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]),
    `${label}: fields mismatch; expected ${sortedExpected.join(', ')}, received ${actual.join(', ') || '<none>'}`
  );
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function assertSameSet(actual, expected, message) {
  assert(actual.length === new Set(actual).size, `${message}: duplicate values are not allowed`);
  assert(
    actual.length === expected.length && expected.every((item) => actual.includes(item)),
    `${message}; expected ${expected.join(', ')}, received ${actual.join(', ') || '<empty>'}`
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function reportFailure(error) {
  failures += 1;
  console.error(error instanceof Error ? error.message : String(error));
}
