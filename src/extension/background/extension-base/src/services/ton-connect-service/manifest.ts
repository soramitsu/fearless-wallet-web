import { CONNECT_ERROR, TonConnectError } from '@/util/tonConnect/protocol';

/** The dApp metadata a connect prompt shows (spec/manifest.md). It names the app; it never decides the signing domain. */
export type TonConnectManifest = {
  url: string;
  name: string;
  iconUrl: string;
  termsOfUseUrl?: string;
  privacyPolicyUrl?: string;
};

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 128;
const FETCH_TIMEOUT_MS = 10_000;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** HTTPS, as the spec requires. The extension's own policy lets the background fetch nothing else. */
function httpsUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) return undefined;

  try {
    const url = new URL(value);

    if (url.username || url.password) return undefined;

    return url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The app URL may be a page on this computer while the dApp is in development. */
function appUrl(value: unknown): URL | undefined {
  const secure = httpsUrl(value);

  if (secure) return secure;
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return undefined;

  try {
    const url = new URL(value);

    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

/** A name shown on its own line: controls that could reorder or hide text are dropped, whitespace is collapsed. */
function displayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const name = value
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return name.length > 0 ? name.slice(0, MAX_NAME_LENGTH) : undefined;
}

export function readTonConnectManifest(value: unknown): TonConnectManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TonConnectError(CONNECT_ERROR.MANIFEST_CONTENT, 'The app manifest is not a JSON object');

  const record = value as Record<string, unknown>;
  const url = appUrl(record.url);
  const name = displayName(record.name);
  const iconUrl = httpsUrl(record.iconUrl);

  if (!url || !name || !iconUrl) throw new TonConnectError(CONNECT_ERROR.MANIFEST_CONTENT, 'The app manifest is incomplete');

  const manifest: TonConnectManifest = { url: url.href.replace(/\/$/, ''), name, iconUrl: iconUrl.href };
  const terms = httpsUrl(record.termsOfUseUrl);
  const privacy = httpsUrl(record.privacyPolicyUrl);

  if (terms) manifest.termsOfUseUrl = terms.href;
  if (privacy) manifest.privacyPolicyUrl = privacy.href;

  return manifest;
}

async function readLimitedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));

  if (Number.isFinite(declared) && declared > MAX_MANIFEST_BYTES)
    throw new TonConnectError(CONNECT_ERROR.MANIFEST_CONTENT, 'The app manifest is too large');

  const reader = response.body?.getReader();

  if (!reader) {
    const text = await response.text();

    if (text.length > MAX_MANIFEST_BYTES) throw new TonConnectError(CONNECT_ERROR.MANIFEST_CONTENT, 'The app manifest is too large');

    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;
    total += value.length;
    if (total > MAX_MANIFEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new TonConnectError(CONNECT_ERROR.MANIFEST_CONTENT, 'The app manifest is too large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });

  return new TextDecoder().decode(bytes);
}

/**
 * Fetches the manifest without cookies or a referrer, since the wallet, not the page, asks for it. A failure to reach
 * it answers code 2, an unreadable or incomplete one code 3, as the spec assigns.
 */
export async function fetchTonConnectManifest(
  manifestUrl: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<TonConnectManifest> {
  const url = httpsUrl(manifestUrl);

  if (!url) throw new TonConnectError(CONNECT_ERROR.MANIFEST_NOT_FOUND, 'The app manifest must be served over HTTPS');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetchImpl(url.href, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    throw new TonConnectError(CONNECT_ERROR.MANIFEST_NOT_FOUND, 'The app manifest could not be fetched');
  }

  try {
    if (!response.ok) throw new TonConnectError(CONNECT_ERROR.MANIFEST_NOT_FOUND, `The app manifest answered ${response.status}`);
    if (response.url && !httpsUrl(response.url))
      throw new TonConnectError(CONNECT_ERROR.MANIFEST_NOT_FOUND, 'The app manifest redirected away from HTTPS');

    let parsed: unknown;

    try {
      parsed = JSON.parse(await readLimitedText(response));
    } catch (error) {
      if (error instanceof TonConnectError) throw error;
      throw new TonConnectError(CONNECT_ERROR.MANIFEST_CONTENT, 'The app manifest is not valid JSON');
    }

    return readTonConnectManifest(parsed);
  } finally {
    clearTimeout(timer);
  }
}
