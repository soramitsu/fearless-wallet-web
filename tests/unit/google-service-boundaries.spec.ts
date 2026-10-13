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
const request = () => {
  const [options, callback] = mocks.launch.mock.calls.at(-1)!;
  return { callback, state: new URL(options.url).searchParams.get('state')! };
};
const redirect = (state: string, token = 'public-test-token') =>
  `https://fixture.chromiumapp.org/welcome#access_token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.runtime.lastError = undefined;
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
    await service.createFile({ json, options: { name, address: 'public-address' }, token: 'public-test-token' });
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
    mocks.get.mockResolvedValueOnce({ data: { expires_in: 3600 } });
    await new GoogleService().verifyToken({ token: 'public-token&extra=value' });
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith('https://www.googleapis.com/oauth2/v1/tokeninfo', { params: { access_token: 'public-token&extra=value' } });
  });

  it('collects every page of backup metadata before returning', async () => {
    mocks.get.mockResolvedValueOnce({ data: { files: [{ id: 'first', name: 'First.json' }], nextPageToken: 'public-next' } })
      .mockResolvedValueOnce({ data: { files: [{ id: 'second', name: 'Second.json' }] } });
    const result = await new GoogleService().getFiles({ token: 'public-test-token' });
    expect(result.files.map((file) => file.id)).toEqual(['first', 'second']);
    expect(mocks.get.mock.calls[1][1].params.pageToken).toBe('public-next');
  });

  it('rejects a repeated pagination token instead of silently returning a partial inventory', async () => {
    mocks.get.mockResolvedValue({ data: { files: [], nextPageToken: 'repeated-public-token' } });
    await expect(new GoogleService().getFiles({ token: 'public-test-token' })).rejects.toThrow();
  });

  it('rejects an upload without an acknowledged file identifier', async () => {
    mocks.post.mockResolvedValue({ data: {} });
    await expect(new GoogleService().createFile({ json: '{}', options: { name: 'Public', address: 'public-address' }, token: 'public-test-token' })).rejects.toThrow();
  });

  it('waits for deletion acknowledgement at the exact escaped file resource', async () => {
    const remote = deferred<void>();
    mocks.remove.mockReturnValue(remote.promise);
    let finished = false;
    const pending = settle(new GoogleService().deleteFile({ id: 'public/file?x', token: 'public-test-token' })).then((result) => { finished = true; return result; });
    await tick();
    expect(finished).toBe(false);
    expect(mocks.remove.mock.calls[0][0]).toBe('https://www.googleapis.com/drive/v3/files/public%2Ffile%3Fx');
    remote.reject(new Error('Public fixture network failure'));
    expect(await pending).toHaveProperty('error');
  });
});

describe('Google authorization ownership', () => {
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

  it('propagates runtime cancellation and permits a fresh explicit retry with a new state', async () => {
    const service = new GoogleService();
    const first = settle(service.authExtension({ type: 'main' }));
    const before = request();
    mocks.runtime.lastError = { message: 'Public cancellation' };
    before.callback(undefined);
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
    expect(mocks.create.mock.calls[0][0].url).toBe('chrome-extension://fixture/popup.html#/fearless/wallet/public%2Ftoken%3Fx%23y?wallet=public%2Fwallet%3Fname%3Dx');
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
