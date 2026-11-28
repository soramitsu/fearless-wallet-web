import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(), remove: vi.fn(), get: vi.fn(), launch: vi.fn(), query: vi.fn(), update: vi.fn(), create: vi.fn(),
  runtime: { lastError: undefined as { message: string } | undefined, getURL: (path: string) => `chrome-extension://fixture/${path}` },
}));
vi.mock('axios', () => ({ default: { post: mocks.post, delete: mocks.remove, get: mocks.get } }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: {
  identity: { getRedirectURL: () => 'https://fixture.chromiumapp.org/welcome', launchWebAuthFlow: mocks.launch },
  runtime: mocks.runtime, tabs: { query: mocks.query, update: mocks.update, create: mocks.create },
} }));
vi.mock('@/util/releaseFeatures', () => ({ isGoogleDriveBackupEnabled: () => true }));
import { GoogleService } from '@extension-base/services/google-service';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = <T>(promise: Promise<T>) => promise.then((value) => ({ value }), (error) => ({ error }));
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
let identityFlow: ReturnType<typeof deferred<string | undefined>>;
const request = () => {
  const [options] = mocks.launch.mock.calls.at(-1)!;
  return { callback: identityFlow.resolve, reject: identityFlow.reject, state: new URL(options.url).searchParams.get('state')! };
};
const redirect = (state: string, token = 'public-test-token', expiresIn = 3599) =>
  `https://fixture.chromiumapp.org/welcome#access_token=${encodeURIComponent(token)}&expires_in=${expiresIn}&state=${encodeURIComponent(state)}`;
// Signs in through the identity flow and returns the handle the opened tab's URL carries in place of the token.
const signedIn = async (service: GoogleService, token = 'public-test-token', expiresIn = 3599) => {
  mocks.launch.mockImplementationOnce(async ({ url }: { url: string }) => redirect(new URL(url).searchParams.get('state')!, token, expiresIn));
  await service.authExtension({ type: 'main' });
  const { url } = mocks.create.mock.calls.at(-1)![0] as { url: string };
  return decodeURIComponent(url.split('#/google/')[1]);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.runtime.lastError = undefined;
  mocks.launch.mockImplementation(() => { identityFlow = deferred<string | undefined>(); return identityFlow.promise; });
  mocks.post.mockResolvedValue({ data: { id: 'public-file-id' } });
  mocks.query.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: 1 });
  mocks.update.mockResolvedValue({ id: 2 });
});

describe('Google Drive transport boundaries', () => {
  it('sends valid escaped metadata and exact encrypted JSON with UTF-8 framing', async () => {
    const service = new GoogleService();
    const name = '名前 "quoted"\nline';
    const json = JSON.stringify({ encoded: 'public-encrypted-fixture', meta: { name } });
    await service.createFile({ json, options: { name, address: 'public-address' }, token: await signedIn(service) });
    const [url, body, options] = mocks.post.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    const boundary = options.headers['Content-Type'].split('boundary=')[1];
    const parts = body.split(`--${boundary}`);
    const metadata = JSON.parse(parts[1].split(/\r?\n\r?\n/)[1].trim());
    expect(metadata).toEqual({ name: `${name}.json`, mimeType: 'application/json', description: 'public-address', parents: ['appDataFolder'] });
    expect(parts[2]).toBe(`\r\nContent-Type: application/json\r\n\r\n${json}\r\n`);
    expect(options.headers).not.toHaveProperty('Content-Length');
  });

  it('passes token verification through an encoded query parameter', async () => {
    const service = new GoogleService();
    const handle = await signedIn(service, 'public-token&extra=value');
    mocks.get.mockResolvedValueOnce({ data: { expires_in: 3600 } });
    await service.verifyToken({ token: handle });
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith('https://www.googleapis.com/oauth2/v1/tokeninfo', { params: { access_token: 'public-token&extra=value' } });
  });

  it('collects every page of backup metadata before returning', async () => {
    mocks.get.mockResolvedValueOnce({ data: { files: [{ id: 'first', name: 'First.json' }], nextPageToken: 'public-next' } })
      .mockResolvedValueOnce({ data: { files: [{ id: 'second', name: 'Second.json' }] } });
    const service = new GoogleService();
    const result = await service.getFiles({ token: await signedIn(service) });
    expect(result.files.map((file) => file.id)).toEqual(['first', 'second']);
    expect(mocks.get.mock.calls[1][1].params.pageToken).toBe('public-next');
  });

  it('rejects a repeated pagination token instead of silently returning a partial inventory', async () => {
    const service = new GoogleService();
    const handle = await signedIn(service);
    mocks.get.mockResolvedValue({ data: { files: [], nextPageToken: 'repeated-public-token' } });
    await expect(service.getFiles({ token: handle })).rejects.toThrow();
  });

  it('rejects an upload without an acknowledged file identifier', async () => {
    mocks.post.mockResolvedValue({ data: {} });
    const service = new GoogleService();
    await expect(service.createFile({ json: '{}', options: { name: 'Public', address: 'public-address' }, token: await signedIn(service) })).rejects.toThrow();
  });

  it('waits for deletion acknowledgement at the exact escaped file resource', async () => {
    const remote = deferred<void>();
    mocks.remove.mockReturnValue(remote.promise);
    let finished = false;
    const service = new GoogleService();
    const handle = await signedIn(service);
    const pending = settle(service.deleteFile({ id: 'public/file?x', token: handle })).then((result) => { finished = true; return result; });
    await tick();
    expect(finished).toBe(false);
    expect(mocks.remove.mock.calls[0][0]).toBe('https://www.googleapis.com/drive/v3/files/public%2Ffile%3Fx');
    remote.reject(new Error('Public fixture network failure'));
    expect(await pending).toHaveProperty('error');
  });
});

describe('Google authorization ownership', () => {
  it('handles the promise-only identity API used by Firefox and current Chrome', async () => {
    mocks.launch.mockImplementation(async ({ url }: { url: string }) => redirect(new URL(url).searchParams.get('state')!));
    let completed = false;
    void settle(new GoogleService().authExtension({ type: 'main' })).then(() => { completed = true; });
    await tick();
    expect(completed).toBe(true);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.launch.mock.calls[0]).toHaveLength(1);
  });

  it.each(['cancelled', 'error', 'wrong origin', 'wrong path', 'wrong state', 'empty token'])('rejects %s without navigating', async (mode) => {
    const pending = settle(new GoogleService().authExtension({ type: 'main' }));
    const { callback, state } = request();
    const response = mode === 'cancelled' ? undefined : mode === 'error' ? 'https://fixture.chromiumapp.org/welcome#error=access_denied' :
      mode === 'wrong origin' ? redirect(state).replace('fixture.chromiumapp.org', 'unrelated.example') :
      mode === 'wrong path' ? redirect(state).replace('/welcome#', '/other#') :
      mode === 'wrong state' ? redirect('another-attempt') : redirect(state, '');
    callback(response);
    expect(await pending).toHaveProperty('error');
    await tick();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('propagates identity promise rejection and permits a fresh explicit retry with a new state', async () => {
    const service = new GoogleService();
    const first = settle(service.authExtension({ type: 'main' }));
    const before = request();
    before.reject(new Error('Public cancellation'));
    expect(await first).toHaveProperty('error');
    mocks.runtime.lastError = undefined;
    const second = service.authExtension({ type: 'main' });
    const after = request();
    expect(after.state).not.toBe(before.state);
    expect(after.state.length).toBeGreaterThanOrEqual(32);
    after.callback(redirect(after.state));
    await second;
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it('retains pending ownership through tab acknowledgement and does not navigate an unrelated title match', async () => {
    const service = new GoogleService();
    const tab = deferred<{ id: number }>();
    mocks.query.mockResolvedValue([{ id: 12, title: 'FEARLESS', url: 'https://unrelated.example/' }]);
    mocks.create.mockReturnValue(tab.promise);
    let finished = false;
    const first = service.authExtension({ type: 'export', wallet: 'public/wallet?name=x' }).then(() => { finished = true; });
    const { state, callback } = request();
    callback(redirect(state, 'public/token?x#y'));
    await tick();
    expect(finished).toBe(false);
    const duplicate = settle(service.authExtension({ type: 'main' }));
    expect(await duplicate).toHaveProperty('error');
    expect(mocks.launch).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
    // The tab carries a handle for the token (never the token) and the escaped wallet.
    expect(mocks.create.mock.calls[0][0].url).toMatch(/^chrome-extension:\/\/fixture\/popup\.html#\/fearless\/wallet\/[0-9a-f-]{36}\?wallet=public%2Fwallet%3Fname%3Dx$/u);
    expect(mocks.create.mock.calls[0][0].url).not.toContain('token');
    tab.resolve({ id: 1 });
    await first;
  });

  it('awaits own popup navigation and propagates its failure', async () => {
    mocks.query.mockResolvedValue([{ id: 0, url: 'chrome-extension://fixture/popup.html#/welcome' }]);
    mocks.update.mockRejectedValue(new Error('Public fixture closed tab'));
    const pending = settle(new GoogleService().authExtension({ type: 'main' }));
    const { callback, state } = request();
    callback(redirect(state));
    expect(await pending).toHaveProperty('error');
    expect(mocks.update).toHaveBeenCalledWith(0, expect.objectContaining({ active: true }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('Google access token custody', () => {
  it('opens the wallet tab with a handle, never the token', async () => {
    const service = new GoogleService();
    const handle = await signedIn(service, 'ya29.public-access-token');
    const { url } = mocks.create.mock.calls.at(-1)![0] as { url: string };
    expect(url).not.toContain('ya29');
    expect(handle).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    mocks.get.mockResolvedValueOnce({ data: { files: [] } });
    await service.getFiles({ token: handle });
    expect(mocks.get.mock.calls.at(-1)![1].headers.Authorization).toBe('Bearer ya29.public-access-token');
  });

  it('refuses a raw token, an unknown handle and an expired one', async () => {
    const service = new GoogleService();
    await expect(service.getFiles({ token: 'ya29.public-access-token' })).rejects.toThrow('google_session_unknown');
    await expect(service.getFiles({ token: crypto.randomUUID() })).rejects.toThrow('google_session_expired');
    expect(await service.verifyToken({ token: 'ya29.public-access-token' })).toBeNull();
    const handle = await signedIn(service, 'ya29.public-short-token', 121);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 62_000);
    try {
      await expect(service.getFile({ id: 'public-id', token: handle })).rejects.toThrow('google_session_expired');
    } finally {
      clock.mockRestore();
    }
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
