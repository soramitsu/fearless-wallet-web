import PostMessageProvider from '@extension-base/page/PostMessageProvider';
import type { SendRequest } from '@extension-base/page/types';
import type { ProviderMeta } from '@polkadot/extension-inject/types';

const PROVIDER_META = {
  network: 'Westend',
  node: 'full',
  source: 'fearless-wallet',
  transport: 'wss',
} satisfies ProviderMeta;

type ConnectionSubscriber = (connected: unknown) => void;

interface ProviderHarness {
  connectionSubscribers: ConnectionSubscriber[];
  provider: PostMessageProvider;
  sendRequest: ReturnType<typeof vi.fn>;
}

function createProviderHarness(options: { meta?: unknown; subscriptionAcks?: unknown[] } = {}): ProviderHarness {
  const connectionSubscribers: ConnectionSubscriber[] = [];
  const subscriptionAcks = [...(options.subscriptionAcks ?? [true])];
  const meta = options.meta === undefined ? PROVIDER_META : options.meta;
  const sendRequest = vi.fn((message: string, _request: unknown, subscriber?: ConnectionSubscriber) => {
    if (message === 'pub(rpc.startProvider)') return Promise.resolve(meta);

    if (message === 'pub(rpc.subscribeConnected)') {
      if (subscriber) connectionSubscribers.push(subscriber);

      return Promise.resolve(subscriptionAcks.shift());
    }

    if (message === 'pub(rpc.listProviders)') return Promise.resolve({ westend: PROVIDER_META });

    return Promise.reject(new Error(`unexpected provider request: ${message}`));
  });

  return {
    connectionSubscribers,
    provider: new PostMessageProvider(sendRequest as unknown as SendRequest),
    sendRequest,
  };
}

describe('PostMessageProvider lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails unsupported manual connect and disconnect closed without logging or changing state', async () => {
    const { provider, sendRequest } = createProviderHarness();
    const connected = vi.fn();
    const disconnected = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    provider.on('connected', connected);
    provider.on('disconnected', disconnected);

    for (const operation of ['connect', 'disconnect', 'connect', 'disconnect'] as const) {
      await expect(provider[operation]()).rejects.toMatchObject({
        code: 'post_message_provider_manual_lifecycle_unsupported',
        message: expect.stringContaining(`manual ${operation} is unavailable`),
        name: 'PostMessageProviderError',
      });
    }

    expect(provider.isConnected).toBe(false);
    expect(connected).not.toHaveBeenCalled();
    expect(disconnected).not.toHaveBeenCalled();
    expect(sendRequest).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('emits only real connection transitions and never an initial or duplicate disconnect', async () => {
    const { connectionSubscribers, provider, sendRequest } = createProviderHarness();
    const connected = vi.fn();
    const disconnected = vi.fn();

    provider.on('connected', connected);
    provider.on('disconnected', disconnected);

    await expect(provider.startProvider('westend')).resolves.toEqual(PROVIDER_META);
    expect(sendRequest).toHaveBeenNthCalledWith(1, 'pub(rpc.startProvider)', 'westend');
    expect(sendRequest).toHaveBeenNthCalledWith(2, 'pub(rpc.subscribeConnected)', null, expect.any(Function));
    expect(provider.isConnected).toBe(false);
    expect(disconnected).not.toHaveBeenCalled();

    const notify = connectionSubscribers[0];

    notify(false);
    notify(true);
    notify(true);
    notify(false);
    notify(false);

    expect(connected).toHaveBeenCalledOnce();
    expect(disconnected).toHaveBeenCalledOnce();
    expect(provider.isConnected).toBe(false);
  });

  it('returns idempotent listener cleanup functions without suppressing state updates', async () => {
    const { connectionSubscribers, provider } = createProviderHarness();
    const connected = vi.fn();
    const removeConnectedListener = provider.on('connected', connected);

    await provider.startProvider('westend');

    removeConnectedListener();
    removeConnectedListener();
    connectionSubscribers[0](true);

    expect(provider.isConnected).toBe(true);
    expect(connected).not.toHaveBeenCalled();
  });

  it('rejects malformed connection notifications and drops a previously connected state', async () => {
    const { connectionSubscribers, provider } = createProviderHarness();
    const errors = vi.fn();
    const disconnected = vi.fn();

    provider.on('error', errors);
    provider.on('disconnected', disconnected);
    await provider.startProvider('westend');

    const notify = connectionSubscribers[0];

    notify(true);
    expect(provider.isConnected).toBe(true);

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    for (const malformed of ['true', 1, null, circular]) notify(malformed);

    expect(provider.isConnected).toBe(false);
    expect(disconnected).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledTimes(4);
    expect(errors).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        code: 'post_message_provider_invalid_connection_state',
        message: expect.stringContaining('received string'),
      })
    );
    expect(errors).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        code: 'post_message_provider_invalid_connection_state',
        message: expect.stringContaining('received object'),
      })
    );
  });

  it('deduplicates repeated starts and rejects attempts to switch a bound page channel', async () => {
    const { provider, sendRequest } = createProviderHarness();

    const [first, concurrentReplay] = await Promise.all([
      provider.startProvider('westend'),
      provider.startProvider('westend'),
    ]);

    expect(first).toEqual(PROVIDER_META);
    expect(concurrentReplay).toEqual(PROVIDER_META);
    await expect(provider.startProvider('westend')).resolves.toEqual(PROVIDER_META);
    expect(sendRequest).toHaveBeenCalledTimes(2);

    await expect(provider.startProvider('polkadot')).rejects.toMatchObject({
      code: 'post_message_provider_already_started',
      message: expect.stringContaining('westend is already bound'),
    });
    expect(sendRequest).toHaveBeenCalledTimes(2);
  });

  it('fails malformed start responses closed and allows a clean retry after a bad subscription acknowledgement', async () => {
    const malformed = createProviderHarness({ meta: null });

    await expect(malformed.provider.startProvider('westend')).rejects.toMatchObject({
      code: 'post_message_provider_invalid_provider_meta',
    });
    expect(malformed.connectionSubscribers).toHaveLength(0);
    expect(malformed.provider.isConnected).toBe(false);

    const retryable = createProviderHarness({ subscriptionAcks: [false, true] });

    await expect(retryable.provider.startProvider('westend')).rejects.toMatchObject({
      code: 'post_message_provider_invalid_connection_state',
      message: expect.stringContaining('did not acknowledge'),
    });
    await expect(retryable.provider.startProvider('westend')).resolves.toEqual(PROVIDER_META);
    expect(retryable.connectionSubscribers).toHaveLength(2);

    retryable.connectionSubscribers[0](true);
    expect(retryable.provider.isConnected).toBe(false);
    retryable.connectionSubscribers[1](true);
    expect(retryable.provider.isConnected).toBe(true);
  });

  it.each([
    ['empty network', { ...PROVIDER_META, network: '' }],
    ['padded source', { ...PROVIDER_META, source: ' fearless-wallet' }],
    ['control-bearing transport', { ...PROVIDER_META, transport: 'ws\n' }],
    ['oversized network', { ...PROVIDER_META, network: 'n'.repeat(257) }],
    ['inherited fields', Object.create(PROVIDER_META) as ProviderMeta],
  ])('rejects %s provider metadata before subscribing', async (_label, meta) => {
    const { connectionSubscribers, provider } = createProviderHarness({ meta });

    await expect(provider.startProvider('westend')).rejects.toMatchObject({
      code: 'post_message_provider_invalid_provider_meta',
    });
    expect(connectionSubscribers).toHaveLength(0);
  });

  it('keeps each provider and clone bound to its own request channel', async () => {
    const first = createProviderHarness();
    const clone = first.provider.clone();
    const second = createProviderHarness();

    await expect(clone.listProviders()).resolves.toEqual({ westend: PROVIDER_META });

    expect(first.sendRequest).toHaveBeenCalledWith('pub(rpc.listProviders)', undefined);
    expect(second.sendRequest).not.toHaveBeenCalled();
  });

  it('rejects empty, padded, control-bearing, oversized, and non-string provider keys before posting a request', async () => {
    const { provider, sendRequest } = createProviderHarness();

    for (const key of ['', '   ', ' westend', 'westend ', 'west\nend', 'x'.repeat(129), null, 7]) {
      await expect(provider.startProvider(key as never)).rejects.toMatchObject({
        code: 'post_message_provider_invalid_provider_meta',
        message: expect.stringContaining('provider key must be an unpadded, control-free string'),
      });
    }

    expect(sendRequest).not.toHaveBeenCalled();
  });
});
