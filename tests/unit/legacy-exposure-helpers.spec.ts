import { decodeAddress, encodeAddress } from '@polkadot/util-crypto';
import { describe, expect, it, vi } from 'vitest';
import type { LegacyExposureStatus } from '@extension-base/services/legacy-exposure-service';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@/extension/messaging', () => ({}));
vi.mock('@/extension/messaging/index', () => ({ sendMessage: vi.fn() }));
vi.mock('@/stores/networks', () => ({
  useNetworksStore: () => ({
    allNetworks: [],
    getNetwork: (name: string) => ({
      name,
      addressPrefix: name === 'Kusama' ? 2 : 0,
      ecosystem: name === 'Solana' ? 'solana' : 'substrate',
    }),
  }),
}));

import { getOwnWalletRecipient } from '@/helpers/transfers';
import {
  LEGACY_EXPOSURE_VERSIONS,
  isLegacyExposedAddress,
  remainingBalances,
  walletsStillToMove,
  walletsToReview,
} from '@/util/legacyExposure';

const SUBSTRATE = '5EPCUjPxiHAcNooYipQFWr9NmmXJKpNG5RhcntXwbtUySrgH';
const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const TON = 'UQCG65A1CoCyKH3Xet8GNkEcfyGiZolh2DG2zc8rXRVHSPJ0';
const NEW_SUBSTRATE = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const NEW_EVM = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';
const NEW_SOLANA = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const NEW_TON = 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44';

const status = (overrides: Partial<LegacyExposureStatus>): LegacyExposureStatus => ({
  state: 'acknowledged',
  wallets: [
    { address: SUBSTRATE, walletEcosystem: WalletEcosystem.Substrate, name: 'Main', present: true },
    { address: EVM.toLowerCase(), walletEcosystem: WalletEcosystem.Evm, name: 'Imported key', present: true, movedAt: 1 },
    { address: TON, walletEcosystem: WalletEcosystem.Ton, name: 'TON', present: false },
  ],
  newWallets: [],
  ...overrides,
});

describe('the exposure notice helpers', () => {
  it('names the published builds that sent phrases, and no other', () => {
    expect(LEGACY_EXPOSURE_VERSIONS).toEqual({ first: '3.0.1', from: '3.0.3', to: '3.0.5' });
  });

  it('recognizes an old wallet whether pending, acknowledged, removed, or shown checksummed', () => {
    expect(isLegacyExposedAddress(status({}), SUBSTRATE)).toBe(true);
    expect(isLegacyExposedAddress(status({}), EVM)).toBe(true);
    expect(isLegacyExposedAddress(status({}), TON)).toBe(true);
    expect(isLegacyExposedAddress(status({ state: 'notice_pending' }), SUBSTRATE)).toBe(true);
    expect(isLegacyExposedAddress(status({}), NEW_SUBSTRATE)).toBe(false);
    // SS58 addresses are compared exactly; only 0x addresses ignore case.
    expect(isLegacyExposedAddress(status({}), SUBSTRATE.toLowerCase())).toBe(false);
  });

  it('says nothing when there is nothing to tell or nothing known', () => {
    for (const state of ['not_exposed', 'unknown'] as const) {
      expect(isLegacyExposedAddress(status({ state }), SUBSTRATE)).toBe(false);
    }
    expect(isLegacyExposedAddress(undefined, SUBSTRATE)).toBe(false);
    expect(isLegacyExposedAddress(status({}), '')).toBe(false);
  });

  it('counts old wallets still in the app and not marked as moved, after the notice only', () => {
    expect(walletsStillToMove(status({})).map(({ address }) => address)).toEqual([SUBSTRATE]);
    expect(walletsStillToMove(status({ state: 'notice_pending' }))).toEqual([]);
    expect(walletsStillToMove(undefined)).toEqual([]);
  });

  it('offers imported-key guidance without claiming a pre-update wallet', () => {
    const imported = { address: NEW_SUBSTRATE, walletEcosystem: WalletEcosystem.Substrate, name: 'Imported', present: true };
    const freshProfile = status({ state: 'not_exposed', wallets: [], importedWallets: [imported] });

    expect(walletsToReview(freshProfile)).toEqual([imported]);
    expect(walletsStillToMove(freshProfile)).toEqual([imported]);
    expect(isLegacyExposedAddress(freshProfile, NEW_SUBSTRATE)).toBe(false);
    expect(walletsStillToMove(status({ ...freshProfile, importedWallets: [{ ...imported, movedAt: 1 }] }))).toEqual([]);
    expect(walletsToReview(status({ ...freshProfile, state: 'unknown' }))).toEqual([]);
  });

  it('lists every balance above zero, testnets left out, a network coin after its tokens', () => {
    const rows = remainingBalances(
      [
        {
          groupId: 'dot',
          symbol: 'dot',
          balances: [
            { name: 'Polkadot', total: '2.5', isUtility: true },
            { name: 'Polkadot AssetHub', total: '0', isUtility: true },
            { name: 'Westend', total: '9', isUtility: true },
          ],
        },
        { groupId: 'usdt', symbol: 'usdt', balances: [{ name: 'Polkadot AssetHub', total: '10' }] },
        { groupId: 'pha', symbol: 'pha', balances: [{ name: 'Polkadot', total: '1' }, { name: 'Kusama', total: undefined }] },
      ],
      (network) => network === 'Westend'
    );

    expect(rows).toEqual([
      { groupId: 'pha', symbol: 'PHA', network: 'Polkadot', amount: '1', isUtility: false },
      { groupId: 'dot', symbol: 'DOT', network: 'Polkadot', amount: '2.5', isUtility: true },
      { groupId: 'usdt', symbol: 'USDT', network: 'Polkadot AssetHub', amount: '10', isUtility: false },
    ]);
  });
});

describe('the Send screen recipient from the guide', () => {
  const wallets = [
    {
      address: NEW_SUBSTRATE,
      ethereumAddress: NEW_EVM,
      solanaAddress: NEW_SOLANA,
      walletEcosystem: WalletEcosystem.Substrate,
    },
    { address: NEW_TON, ethereumAddress: '', walletEcosystem: WalletEcosystem.Ton },
  ];

  it("fills in the new wallet's address for the network", () => {
    const publicKey = decodeAddress(NEW_SUBSTRATE);

    expect(getOwnWalletRecipient(wallets, NEW_SUBSTRATE, 'Polkadot')).toBe(encodeAddress(publicKey, 0));
    expect(getOwnWalletRecipient(wallets, NEW_SUBSTRATE, 'Kusama')).toBe(encodeAddress(publicKey, 2));
    expect(getOwnWalletRecipient(wallets, NEW_SUBSTRATE, 'Ethereum')).toBe(NEW_EVM);
    expect(getOwnWalletRecipient(wallets, NEW_SUBSTRATE, 'Solana')).toBe(NEW_SOLANA);
    expect(getOwnWalletRecipient(wallets, NEW_TON, 'TON Mainnet')).toBe(NEW_TON);
  });

  it('never fills in an address the user does not own, or one of the wrong kind', () => {
    expect(getOwnWalletRecipient(wallets, '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', 'Polkadot')).toBe('');
    expect(getOwnWalletRecipient(wallets, NEW_TON, 'Polkadot')).toBe('');
    expect(getOwnWalletRecipient(wallets, NEW_SUBSTRATE, 'TON Mainnet')).toBe('');
  });
});
