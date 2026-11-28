import { describe, expect, it, vi } from 'vitest';
import { fetchTonConnectManifest, readTonConnectManifest } from '@extension-base/services/ton-connect-service/manifest';
import { readTonConnectSessions } from '@extension-base/services/ton-connect-service/store';
import { TonConnectError } from '@/util/tonConnect/protocol';

const valid = { url: 'https://app.example/', name: '  Example‮ dApp ', iconUrl: 'https://app.example/icon.png' };

const respond = (body: string, init: ResponseInit & { url?: string } = {}) => {
  const response = new Response(body, { status: 200, ...init });

  if (init.url) Object.defineProperty(response, 'url', { value: init.url });

  return response;
};

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TonConnectError) return error.code;
    throw error;
  }
  return undefined;
};

describe('TON Connect manifest', () => {
  it('reads the fields it shows and cleans the name', () => {
    expect(readTonConnectManifest({ ...valid, termsOfUseUrl: 'http://insecure.example/terms', extra: 1 })).toEqual({
      url: 'https://app.example',
      name: 'Example dApp',
      iconUrl: 'https://app.example/icon.png',
    });
  });

  it('refuses a manifest without a name, an HTTPS icon or an app URL', () => {
    expect(() => readTonConnectManifest({ ...valid, name: '' })).toThrow(TonConnectError);
    expect(() => readTonConnectManifest({ ...valid, iconUrl: 'http://app.example/icon.png' })).toThrow(TonConnectError);
    expect(() => readTonConnectManifest({ ...valid, url: 'javascript:alert(1)' })).toThrow(TonConnectError);
  });

  it('fetches without cookies or a referrer', async () => {
    const fetchImpl = vi.fn(async () => respond(JSON.stringify(valid)));

    await expect(fetchTonConnectManifest('https://app.example/tonconnect-manifest.json', fetchImpl)).resolves.toMatchObject({
      name: 'Example dApp',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://app.example/tonconnect-manifest.json',
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer' })
    );
  });

  it('answers code 2 when the manifest cannot be reached and code 3 when it cannot be read', async () => {
    expect(await codeOf(fetchTonConnectManifest('http://app.example/m.json', vi.fn()))).toBe(2);
    expect(await codeOf(fetchTonConnectManifest('https://app.example/m.json', vi.fn(async () => Promise.reject(new TypeError('offline')))))).toBe(2);
    expect(await codeOf(fetchTonConnectManifest('https://app.example/m.json', vi.fn(async () => respond('', { status: 404 }))))).toBe(2);
    expect(
      await codeOf(fetchTonConnectManifest('https://app.example/m.json', vi.fn(async () => respond('{}', { url: 'http://app.example/m.json' }))))
    ).toBe(2);
    expect(await codeOf(fetchTonConnectManifest('https://app.example/m.json', vi.fn(async () => respond('not json'))))).toBe(3);
    expect(await codeOf(fetchTonConnectManifest('https://app.example/m.json', vi.fn(async () => respond('x'.repeat(70 * 1024)))))).toBe(3);
  });

  it('gives up on a manifest that does not answer', async () => {
    const hanging = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    );

    expect(await codeOf(fetchTonConnectManifest('https://app.example/m.json', hanging as typeof fetch, 10))).toBe(2);
  });
});

describe('TON Connect saved sessions', () => {
  it('keeps readable sessions and drops the rest without guessing', () => {
    const session = {
      origin: 'https://app.example',
      address: 'EQ-address',
      manifest: { url: 'https://app.example', name: 'Example', iconUrl: 'https://app.example/icon.png' },
      connectedAt: 1,
      lastRequestId: '4',
    };

    expect(
      readTonConnectSessions({
        version: 1,
        sessions: {
          'https://app.example': session,
          'https://other.example': { ...session },
          'http://insecure.example': { ...session, origin: 'http://insecure.example' },
          'https://bad-id.example': { ...session, origin: 'https://bad-id.example', lastRequestId: 'x' },
        },
      })
    ).toEqual({ version: 1, sessions: { 'https://app.example': session } });
    expect(readTonConnectSessions(undefined)).toEqual({ version: 1, sessions: {} });
    expect(readTonConnectSessions({ version: 2, sessions: { a: session } })).toEqual({ version: 1, sessions: {} });
  });
});
