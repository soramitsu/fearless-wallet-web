import { handleResponse } from '@extension-base/page';
import { FearlessWalletIrohaProvider } from '@extension-base/page/FearlessWalletIrohaProvider';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { IrohaAccountInfo, IrohaConnectResponse } from '@extension-base/page/types';
import type { MessageTypes, TransportRequestMessage } from '@extension-base/background/types/types';

type PostedMessage = TransportRequestMessage<MessageTypes>;

const { nexus, taira } = vectors.vectors[0].expected.iroha;
const nexusAccount: IrohaAccountInfo = {
  address: nexus.i105,
  chain: 'sora:nexus',
  name: 'Universal',
  network: 'nexus',
  publicKeyHex: nexus.publicKeyHex,
};
const tairaAccount: IrohaAccountInfo = {
  address: taira.i105,
  chain: 'iroha:taira',
  name: 'Universal',
  network: 'taira',
  publicKeyHex: taira.publicKeyHex,
};

const response = (id: string, body: IrohaConnectResponse | boolean) => {
  handleResponse({
    id,
    response: body,
  } as never);
};

const reject = (id: string, error: string) => {
  handleResponse({ error, id } as never);
};

async function initializeProvider(provider: FearlessWalletIrohaProvider, postedMessages: PostedMessage[]): Promise<void> {
  response(postedMessages[0].id, { accounts: [] });
  response(postedMessages[1].id, true);
  await Promise.resolve();
}

describe('FearlessWalletIrohaProvider', () => {
  let postedMessages: PostedMessage[];

  beforeEach(() => {
    postedMessages = [];
    document.title = 'SORA Nexus dApp';

    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      postedMessages.push(message as PostedMessage);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses Iroha-scoped messages for Nexus connect, accounts, and disconnect', async () => {
    const provider = new FearlessWalletIrohaProvider();
    const connected = vi.fn();
    const accountChanged = vi.fn();
    const disconnected = vi.fn();

    provider.on('connect', connected);
    provider.on('accountChanged', accountChanged);
    provider.on('disconnect', disconnected);

    expect(postedMessages[0]).toMatchObject({
      message: 'iroha(accounts)',
      request: { network: 'nexus', origin: 'SORA Nexus dApp', silent: true },
    });
    expect(postedMessages[1]).toMatchObject({
      message: 'iroha(events.subscribe)',
      request: { network: 'nexus', origin: 'SORA Nexus dApp', silent: true },
    });

    await initializeProvider(provider, postedMessages);

    const connect = provider.connect();
    const connectMessage = postedMessages[2];

    expect(connectMessage).toMatchObject({
      message: 'iroha(authorizeUrl)',
      request: { network: 'nexus', origin: 'SORA Nexus dApp', silent: false },
    });

    response(connectMessage.id, { accounts: [nexusAccount] });

    await expect(connect).resolves.toEqual({ accounts: [nexusAccount] });
    expect(provider.connected).toBe(true);
    expect(provider.selectedAddress).toBe(nexus.i105);
    expect(provider.publicKeyHex).toBe(nexus.publicKeyHex);
    expect(connected).toHaveBeenCalledWith(nexusAccount);
    expect(accountChanged).toHaveBeenLastCalledWith(nexusAccount);

    const accounts = provider.request({ method: 'accounts' });
    const accountsMessage = postedMessages[3];

    expect(accountsMessage).toMatchObject({
      message: 'iroha(accounts)',
      request: { network: 'nexus', origin: 'SORA Nexus dApp', silent: true },
    });
    response(accountsMessage.id, { accounts: [nexusAccount] });
    await expect(accounts).resolves.toEqual({ accounts: [nexusAccount] });

    const disconnect = provider.disconnect();
    const disconnectMessage = postedMessages[4];

    expect(disconnectMessage).toMatchObject({ message: 'iroha(disconnect)' });
    response(disconnectMessage.id, { accounts: [] });
    await disconnect;

    expect(provider.connected).toBe(false);
    expect(provider.selectedAddress).toBeNull();
    expect(disconnected).toHaveBeenCalledOnce();
  });

  it('supports explicit Taira connect and fails signing closed until the browser codec is available', async () => {
    const provider = new FearlessWalletIrohaProvider();

    await initializeProvider(provider, postedMessages);

    const connect = provider.connect({ network: 'taira' });
    const subscriptionMessage = postedMessages[2];
    const connectMessage = postedMessages[3];

    expect(subscriptionMessage).toMatchObject({
      message: 'iroha(events.subscribe)',
      request: { network: 'taira', origin: 'SORA Nexus dApp', silent: true },
    });
    response(subscriptionMessage.id, true);

    expect(connectMessage).toMatchObject({
      message: 'iroha(authorizeUrl)',
      request: { network: 'taira', origin: 'SORA Nexus dApp', silent: false },
    });

    response(connectMessage.id, { accounts: [tairaAccount] });

    await expect(connect).resolves.toEqual({ accounts: [tairaAccount] });
    await expect(provider.request({ method: 'signTransaction', params: {} })).rejects.toThrow(
      'Iroha transaction signing is not available'
    );
  });

  it('rejects invalid network values before changing provider state or posting requests', async () => {
    const provider = new FearlessWalletIrohaProvider();

    await initializeProvider(provider, postedMessages);
    const messageCount = postedMessages.length;

    await expect(provider.connect({ network: 'devnet' as never })).rejects.toThrow('invalid_iroha_network');
    expect(postedMessages).toHaveLength(messageCount);
    expect(provider.accounts).toEqual([]);
  });

  it('keeps the current account stable across same-network reconnects and authorization failures', async () => {
    const provider = new FearlessWalletIrohaProvider();
    const connected = vi.fn();
    const disconnected = vi.fn();

    provider.on('connect', connected);
    provider.on('disconnect', disconnected);
    await initializeProvider(provider, postedMessages);

    const firstConnect = provider.connect({ network: 'nexus' });
    response(postedMessages[2].id, { accounts: [nexusAccount] });
    await firstConnect;

    const reconnect = provider.connect({ network: 'nexus' });

    expect(provider.selectedAddress).toBe(nexus.i105);
    expect(disconnected).not.toHaveBeenCalled();
    response(postedMessages[3].id, { accounts: [nexusAccount] });
    await reconnect;
    expect(connected).toHaveBeenCalledOnce();
    expect(disconnected).not.toHaveBeenCalled();

    const rejectedReconnect = provider.connect({ network: 'nexus' });

    reject(postedMessages[4].id, 'authorization rejected');
    await expect(rejectedReconnect).rejects.toThrow('authorization rejected');
    expect(provider.selectedAddress).toBe(nexus.i105);
    expect(provider.connected).toBe(true);
    expect(disconnected).not.toHaveBeenCalled();
  });

  it('ignores stale Nexus events and superseded connects after switching to Taira', async () => {
    const provider = new FearlessWalletIrohaProvider();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await initializeProvider(provider, postedMessages);

    const nexusConnect = provider.connect({ network: 'nexus' });
    const nexusAuthorize = postedMessages[2];
    const tairaConnect = provider.connect({ network: 'taira' });
    const tairaSubscription = postedMessages[3];
    const tairaAuthorize = postedMessages[4];

    response(tairaSubscription.id, true);
    response(tairaAuthorize.id, { accounts: [tairaAccount] });
    await expect(tairaConnect).resolves.toEqual({ accounts: [tairaAccount] });

    response(nexusAuthorize.id, { accounts: [nexusAccount] });
    await expect(nexusConnect).rejects.toThrow('iroha_connect_superseded');

    handleResponse({ id: postedMessages[1].id, subscription: { accounts: [nexusAccount] } } as never);
    expect(provider.selectedAddress).toBe(taira.i105);

    handleResponse({ id: tairaSubscription.id, subscription: { accounts: [nexusAccount] } } as never);
    expect(provider.selectedAddress).toBe(taira.i105);
    expect(error).toHaveBeenCalledWith(
      'Ignored invalid Iroha account subscription payload',
      expect.objectContaining({ message: 'iroha_account_network_mismatch' })
    );

    handleResponse({ id: tairaSubscription.id, subscription: { accounts: [] } } as never);
    expect(provider.connected).toBe(false);
  });
});
