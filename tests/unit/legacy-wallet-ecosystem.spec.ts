import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import State from '@extension-base/background/handlers/State';
import { walletEcosystemOf } from '@extension-base/background/helpers/walletEcosystem';
import { NetworkService } from '@extension-base/services/network-service';
import { SubscriptionService } from '@extension-base/services/subscription-service';
import type { FWKeyringMeta } from '@extension-base/types';
import { api as apiSora } from '@/sora';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  get() {}
  getAndWait() { return Promise.resolve(undefined); }
  getSubject() { return { next() {} }; }
  updateAndWait() { return Promise.resolve(); }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { update({}); }
  getAndWait() { return Promise.resolve({}); }
  set() {}
} }));
vi.mock('@polkadot/extension-chains', () => ({ addMetadata: vi.fn() }));

type Profile = { storage: Record<string, { address?: string; meta?: FWKeyringMeta; walletEcosystem?: WalletEcosystem } & Record<string, unknown>> };
type Account = { address: string; meta: FWKeyringMeta };

const profile = (path: string) => JSON.parse(readFileSync(resolve(__dirname, '../fixtures/upgrade', path), 'utf8')) as Profile;

// The main accounts the keyring gives for a stored profile: an EVM key linked to a Substrate account is shown with
// it, a standalone one is kept, and TON accounts come from the TON keyring, which records their ecosystem.
function mainAccounts({ storage }: Profile): Account[] {
  const stored = Object.entries(storage).filter(([key]) => key.startsWith('fw:account:')).map(([key, value]) => {
    const suffix = key.slice('fw:account:'.length);
    return { address: /^0x[0-9a-f]{40}$/i.test(suffix) ? suffix : value.address!, meta: value.meta! };
  });
  const linked = new Set(stored.map(({ meta }) => meta.ethereumAddress?.toLowerCase()).filter(Boolean));
  const ton = Object.entries(storage).filter(([key]) => key.startsWith('fw:ton:'))
    .map(([, value]) => ({ address: value.address!, meta: { name: value.name, walletEcosystem: WalletEcosystem.Ton } as FWKeyringMeta }));
  return [...stored.filter(({ address }) => !linked.has(address.toLowerCase())), ...ton];
}

function networkService(accounts: Account[], selectedNetworks: Record<string, string>) {
  const service = new NetworkService({ getAllMainAccounts: () => accounts } as never, {} as never);
  const network = (name: string, ecosystem: string) => ({
    name, key: name, chainId: name.toLowerCase(), ecosystem, active: true, favorite: [], rank: 1, assets: [],
    nodes: [{ name: 'node', url: `wss://${name.replace(' ', '-').toLowerCase()}.invalid` }],
  });
  Object.assign(service.networkMap, {
    Polkadot: network('Polkadot', 'substrate'),
    Kusama: network('Kusama', 'substrate'),
    'Ton Mainnet': network('Ton Mainnet', 'ton'),
  });
  service.selectedNetworks = selectedNetworks;
  return service;
}

const S1 = profile('2.6.3/S1-per-account-passwords.json');
const S2 = profile('3.0.5/S2-from-2.6.3-partial-migration.json');

describe('wallets written by 1.x-2.7.x, which have no walletEcosystem', () => {
  it('give an EVM address the EVM ecosystem and any other address Substrate, keeping a recorded one', () => {
    const accounts = mainAccounts(S1);
    const echo = accounts.find(({ meta }) => meta.name === 'Echo')!;

    expect(accounts.every(({ meta }) => meta.walletEcosystem === undefined)).toBe(true);
    expect(walletEcosystemOf(echo.address, echo.meta.walletEcosystem)).toBe(WalletEcosystem.Evm);
    expect(walletEcosystemOf('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY')).toBe(WalletEcosystem.Substrate);
    expect(walletEcosystemOf('UQAD_oydckKRarK7iJCk46M9IO1MkGUIvtb7IZTHbeNQnNS_', WalletEcosystem.Ton)).toBe(WalletEcosystem.Ton);
  });

  it('connect the Substrate networks of their saved "all" selection (2.6.3 profile)', () => {
    const service = networkService(mainAccounts(S1), S1.storage.selectedNetworks as unknown as Record<string, string>);

    expect(service.getActiveNetworks().map(({ name }) => name)).toEqual(['Polkadot', 'Kusama']);
  });

  it('connect them next to TON wallets that 3.0.5 added (2.6.3 -> 3.0.5 profile)', () => {
    const service = networkService(mainAccounts(S2), S2.storage.selectedNetworks as unknown as Record<string, string>);

    expect(service.getActiveNetworks().map(({ name }) => name)).toEqual(['Polkadot', 'Kusama', 'Ton Mainnet']);
  });

  it('subscribe the selected wallet to live Substrate balances', async () => {
    const current = S1.storage['fwcurrent_account:CurrentAccountInfo'] as unknown as { address: string; ethereumAddress: string };
    const subscribeSubstrateBalances = vi.fn().mockReturnValue([]);
    const state = {
      requestService: { mutateAuthorizations: vi.fn().mockResolvedValue(undefined) },
      currentAccount: current,
      balanceService: { fetchBalance: vi.fn(), substrateBalanceService: { subscribeSubstrateBalances } },
    };
    const service = new SubscriptionService(state as never);

    expect(current).not.toHaveProperty('walletEcosystem');
    await service.fetchNetworkBalances({ ...current, substrateNetworks: ['polkadot'] });

    expect(subscribeSubstrateBalances).toHaveBeenCalledOnce();
  });

  it('bind the selected wallet\'s key to the SORA client', async () => {
    const current = S1.storage['fwcurrent_account:CurrentAccountInfo'] as unknown as { address: string };
    const pair = { address: current.address };
    const state = Object.setPrototypeOf({
      serviceInfoSubject: new Subject(),
      poolsService: { unsubscribePools: vi.fn() },
      networkService: { networkMap: {}, getApiMap: {} },
      keyringService: {
        currentAccountSubject: { value: current },
        getPair: vi.fn((address: string) => (address === current.address ? pair : undefined)),
        setCurrentAccount: vi.fn(async (data: unknown, committed: (value: unknown) => void) => committed(data)),
      },
    }, State.prototype) as State;

    await state.setCurrentAccount(current as never);

    expect((apiSora as unknown as { account?: { pair: unknown } }).account?.pair).toBe(pair);
  });
});
