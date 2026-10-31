import { afterEach, describe, expect, it, vi } from 'vitest';
import { storage } from '@extension-base/stores/Storage';
import { NftService } from '@extension-base/services/nft-service';
import type State from '@extension-base/background/handlers/State';
import type { NftState } from '@extension-base/services/nft-service/types';

const { clients } = vi.hoisted(() => ({ clients: new Map<string, { chainId: string; timespan: Record<string, number>; fetchNftsForWallet: ReturnType<typeof vi.fn> }>() }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) } }));
vi.mock('@extension-base/api/evm/transfer', () => ({ calcEvmFees: vi.fn() }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ getBalanceItem: vi.fn() }));
vi.mock('@extension-base/services/nft-service/handlers/AlchemyNftSdk', () => ({ default: class {
  chainId: string;
  timespan = {};
  fetchNftsForWallet = vi.fn(async () => ({}));
  constructor(_network: string, chainId: string) { this.chainId = chainId; clients.set(chainId, this); }
} }));

const owner = '0x' + '11'.repeat(20);
const snapshot = (name: string): NftState => ({ contract: { address: 'contract', network: 'Ethereum', name, ownedNfts: [] } });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  clients.clear();
  const state = { currentAccount: { ethereumAddress: owner }, networkService: { networkMap: {} }, keyringService: { getEthereumAddress: () => owner } };
  const service = new NftService(state as unknown as State);
  return { service, state, sdk: clients.get('1')! };
}
afterEach(() => vi.restoreAllMocks());

describe('NFT refresh ownership', () => {
  it('keeps a user preference changed while startup storage is still loading', async () => {
    const pending = deferred<{ nftSettings: Record<string, { airdrop: boolean; spam: boolean }> }>();
    vi.mocked(storage.get).mockReturnValueOnce(pending.promise as never);
    const { service } = fixture();
    vi.spyOn(service, 'getNftForActiveNetworks').mockResolvedValue();
    service.changeSettings({ address: owner, settings: { airdrop: true, spam: true } });
    pending.resolve({ nftSettings: { [owner]: { airdrop: false, spam: true }, other: { airdrop: true, spam: true } } });
    await pending.promise;
    expect(service.hideSettings[owner].airdrop).toBe(true);
    expect(service.hideSettings.other.airdrop).toBe(true);
    await vi.waitFor(() => expect(storage.set).toHaveBeenLastCalledWith({ nftSettings: {
      [owner]: { airdrop: true, spam: true }, other: { airdrop: true, spam: true },
    } }));
  });
  it('copies preferences instead of retaining a mutable caller object', () => {
    const { service } = fixture();
    vi.spyOn(service, 'getNftForActiveNetworks').mockResolvedValue();
    const settings = { airdrop: true, spam: true };
    service.changeSettings({ address: owner, settings });
    settings.airdrop = false;
    expect(service.hideSettings[owner].airdrop).toBe(true);
  });
  it('keeps the newest forced refresh when responses arrive out of order', async () => {
    const { service, sdk } = fixture();
    const first = deferred<NftState>();
    sdk.fetchNftsForWallet.mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot('new'));
    const old = service.getNftForActiveNetworks(owner, true);
    await service.getNftForActiveNetworks(owner, true);
    first.resolve(snapshot('old'));
    await old;
    expect(service.nftMap[owner]['1'].contract.name).toBe('new');
  });
  it('does not mark a newer success stale after an older request fails', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { service, sdk } = fixture();
    const first = deferred<NftState>();
    sdk.fetchNftsForWallet.mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshot('new'));
    const old = service.getNftForActiveNetworks(owner, true);
    await service.getNftForActiveNetworks(owner, true);
    first.reject(new Error('old failure'));
    await old;
    expect(service.nftMap[owner]['1'].contract.syncStale).toBe(false);
  });
  it('does not recreate data after its wallet is removed', async () => {
    const { service, sdk } = fixture();
    const pending = deferred<NftState>();
    sdk.fetchNftsForWallet.mockReturnValueOnce(pending.promise);
    const request = service.getNftForActiveNetworks(owner, true);
    service.deleteSavedNfts('substrate-owner');
    pending.resolve(snapshot('removed'));
    await request;
    expect(service.nftMap[owner]).toBeUndefined();
    expect(sdk.timespan[owner]).toBeUndefined();
  });
  it('returns only after all eligible networks have settled', async () => {
    const { service, sdk } = fixture();
    const pending = deferred<NftState>();
    sdk.fetchNftsForWallet.mockReturnValueOnce(pending.promise);
    let completed = false;
    const request = service.fetchNfts(owner).then(() => { completed = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(completed).toBe(false);
    pending.resolve(snapshot('done'));
    await request;
    expect(service.nftMap[owner]['1'].contract.name).toBe('done');
  });
  it('clears the published view when no EVM account is selected', () => {
    const { service, state } = fixture();
    const emit = vi.fn(); service.nftSubject.subscribe(emit);
    state.currentAccount.ethereumAddress = '';
    service.publishNfts();
    expect(emit).toHaveBeenCalledExactlyOnceWith({});
  });
  it('refreshes the settings owner instead of a different selected account', async () => {
    const { service } = fixture();
    const refresh = vi.spyOn(service, 'getNftForActiveNetworks').mockResolvedValue();
    service.changeSettings({ address: 'other-owner', settings: { airdrop: true, spam: true } });
    expect(refresh).toHaveBeenCalledExactlyOnceWith('other-owner', true);
  });
  it('keeps account results separate and publishes only the selected wallet', async () => {
    const { service, sdk } = fixture();
    const emit = vi.fn(); service.nftSubject.subscribe(emit);
    sdk.fetchNftsForWallet.mockResolvedValue(snapshot('other'));
    await service.getNftForActiveNetworks('other-owner', true);
    expect(service.nftMap['other-owner']['1'].contract.name).toBe('other');
    expect(emit).not.toHaveBeenCalled();
  });
  it('preserves a cached snapshot and marks it stale when its current refresh fails', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { service, sdk } = fixture();
    sdk.fetchNftsForWallet.mockResolvedValueOnce(snapshot('cached')).mockRejectedValueOnce(new Error('offline'));
    await service.getNftForActiveNetworks(owner, true);
    await service.getNftForActiveNetworks(owner, true);
    expect(service.nftMap[owner]['1'].contract).toMatchObject({ name: 'cached', syncStale: true });
  });
  it('throttles fresh results and keeps test networks opt-in', async () => {
    const { service, sdk } = fixture();
    await service.getNftForActiveNetworks(owner);
    await service.getNftForActiveNetworks(owner);
    expect(sdk.fetchNftsForWallet).toHaveBeenCalledOnce();
    expect(clients.get('11155111')!.fetchNftsForWallet).not.toHaveBeenCalled();
  });
});
