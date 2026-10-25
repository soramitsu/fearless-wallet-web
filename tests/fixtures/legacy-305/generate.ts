import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from './getMockAssets.305';
import {
  createAccountsStore305,
  setTonBalanceItem305,
  toggleCurrenciesVisible305,
  type Storage305,
} from './toggle-hide-zero.305';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

// Regenerate with: LEGACY_305_WRITE_FIXTURES=1 node node_modules/.bin/vitest run tests/unit/legacy-preferences-305.spec.ts
// Without the variable the spec only checks that the committed files still equal this generator's output.

export const SNAPSHOT_SHA256 = 'fa6f0e23cd87dfb3e5536980591dd22ae30e49bf59d04dc2a0b31fc53237ea66';
export const SNAPSHOT_PATH = resolve(__dirname, 'chains-v13.snapshot.json');

export const SUBSTRATE_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
export const SECOND_SUBSTRATE_ADDRESS = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
export const TON_ADDRESS = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
export const EVM_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

export const LEGACY_305_FIXTURES = ['switches', 'hide-zero', 'ton', 'evm-standalone'] as const;
export type Legacy305FixtureName = (typeof LEGACY_305_FIXTURES)[number];

export interface Legacy305Fixture {
  description: string;
  address: string;
  /** The extension-origin localStorage entries 3.0.5 left behind, byte for byte. */
  localStorage: Storage305;
}

export const fixturePath = (name: Legacy305FixtureName): string => resolve(__dirname, `localStorage-305.${name}.json`);

export function readSnapshot(): NetworkJson[] {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as NetworkJson[];
}

/** The networkMap of a 3.0.5 production build (`network-service/index.ts:96-131` at 600a64d5), in registry order. */
export function networkMap305(networks: NetworkJson[]): Record<string, NetworkJson> {
  return Object.fromEntries(
    networks
      .filter(({ disabled, options }) => !disabled && !options?.some((option) => option.toLowerCase() === 'testnet'))
      .map((network) => [network.name, network])
  );
}

export function groupOf(groups: TokenGroup[], symbol: string, relayChain: string): TokenGroup {
  const group = groups.find((candidate) => candidate.symbol === symbol && candidate.relayChain === relayChain);
  if (!group) throw new Error(`No 3.0.5 group ${symbol} / ${relayChain}`);
  return group;
}

function fund(groups: TokenGroup[], symbol: string, relayChain: string, networkName: string, amount: string) {
  const balance = groupOf(groups, symbol, relayChain).balances.find(({ name }) => name === networkName.toLowerCase());
  if (!balance) throw new Error(`No ${symbol} on ${networkName}`);
  Object.assign(balance, { state: APIItemState.READY, total: amount, transferable: amount });
}

export const TON_JETTONS_305 = [
  { name: 'Tether USD', symbol: 'usdt', amount: '10' },
  { name: 'Notcoin', symbol: 'not', amount: '0' },
  // A same-symbol impostor that arrived later: 3.0.5 merged it into the Tether USD group.
  { name: 'Tether', symbol: 'usdt', amount: '1' },
  { name: 'Dogs', symbol: 'dogs', amount: '3' },
];

export function generateLegacy305Fixtures(networks = readSnapshot()): Record<Legacy305FixtureName, Legacy305Fixture> {
  const networkMap = networkMap305(networks);
  const substrateGroups = () => getMockAssets(networkMap, WalletEcosystem.Substrate);

  const switches: Storage305 = {};
  {
    const first = createAccountsStore305(SUBSTRATE_ADDRESS, substrateGroups(), switches);
    first.setHiddenAssets({ groupId: groupOf(first.balances, 'ksm', 'Kusama').groupId, value: false });
    first.setHiddenAssets({ groupId: groupOf(first.balances, 'usdt', 'ethereum').groupId, value: false });

    const second = createAccountsStore305(SECOND_SUBSTRATE_ADDRESS, substrateGroups(), switches);
    second.setHiddenAssets({ groupId: groupOf(second.balances, 'dot', 'Polkadot').groupId, value: false });
  }

  const hideZero: Storage305 = {};
  {
    const groups = substrateGroups();
    fund(groups, 'dot', 'Polkadot', 'Polkadot', '12.5');
    fund(groups, 'eth', 'ethereum', 'Ethereum', '0.75');
    fund(groups, 'usdc', 'ethereum', 'Ethereum', '100');
    toggleCurrenciesVisible305(createAccountsStore305(SUBSTRATE_ADDRESS, groups, hideZero), false);
  }

  const ton: Storage305 = {};
  {
    const groups = getMockAssets(networkMap, WalletEcosystem.Ton);
    const network = Object.values(networkMap).find(({ ecosystem }) => ecosystem === 'ton')!;
    const [{ id: tonId, symbol: tonSymbol, precision }] = network.assets;
    const relayChain = network.name.toLowerCase();

    setTonBalanceItem305(groups, network.name, {
      state: APIItemState.READY,
      precision,
      relayChain,
      symbol: tonSymbol,
      id: tonId,
      total: '5',
      transferable: '5',
    });
    TON_JETTONS_305.forEach(({ name, symbol, amount }) =>
      setTonBalanceItem305(groups, network.name, {
        state: APIItemState.READY,
        precision: 9,
        relayChain,
        icon: network.icon,
        id: `${name.toLowerCase()} - ${symbol.toLowerCase()}`,
        name,
        symbol,
        total: amount,
        transferable: amount,
      })
    );

    const store = createAccountsStore305(TON_ADDRESS, groups, ton);
    store.setHiddenAssets({ groupId: 'tether usd - usdt', value: false });
    store.setHiddenAssets({ groupId: 'notcoin - not', value: false });

    // The user dragged Dogs above everything (Currencies.vue's Draggable saved the new order).
    const byId = (groupId: string) => groups.find((group) => group.groupId === groupId)!;
    store.setBalance({
      details: [byId('dogs - dogs'), byId('tether usd - usdt'), byId(tonId), byId('notcoin - not')],
      reset: false,
      saveSequence: true,
    });
  }

  const evmStandalone: Storage305 = {};
  {
    const store = createAccountsStore305(EVM_ADDRESS, substrateGroups(), evmStandalone);
    store.setHiddenAssets({ groupId: groupOf(store.balances, 'eth', 'ethereum').groupId, value: false });
    store.setHiddenAssets({ groupId: groupOf(store.balances, 'usdc', 'ethereum').groupId, value: false });
  }

  return {
    switches: {
      description: 'Two wallets: the first hid the KSM (Kusama) and USDT (ethereum) groups, the second the DOT group.',
      address: SUBSTRATE_ADDRESS,
      localStorage: switches,
    },
    'hide-zero': {
      description: 'Hide zero balances clicked with DOT on Polkadot, ETH and USDC on Ethereum funded.',
      address: SUBSTRATE_ADDRESS,
      localStorage: hideZero,
    },
    ton: {
      description: 'A TON wallet hid the Tether USD and Notcoin jetton groups and dragged Dogs to the top.',
      address: TON_ADDRESS,
      localStorage: ton,
    },
    'evm-standalone': {
      description: 'Hides stored under an 0x wallet address: the ETH and USDC (ethereum) groups.',
      address: EVM_ADDRESS,
      localStorage: evmStandalone,
    },
  };
}

export const serializeFixture = (fixture: Legacy305Fixture): string => `${JSON.stringify(fixture, null, 2)}\n`;

export function writeLegacy305Fixtures(): void {
  const fixtures = generateLegacy305Fixtures();
  LEGACY_305_FIXTURES.forEach((name) => writeFileSync(fixturePath(name), serializeFixture(fixtures[name])));
}

export function readLegacy305Fixture(name: Legacy305FixtureName): Legacy305Fixture {
  return JSON.parse(readFileSync(fixturePath(name), 'utf8')) as Legacy305Fixture;
}
