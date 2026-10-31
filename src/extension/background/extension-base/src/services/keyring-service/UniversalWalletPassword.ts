import type { RequestExportSeed, ResponseExportSeed } from '@extension-base/background/types/types';
import type { FWKeyringMeta } from '@extension-base/types';
import type BalanceService from '@extension-base/services/balance-service';
import {
  deriveUniversalWalletNetworkFields,
  universalWalletNetworkKeys,
  type UniversalWalletNetworkFields,
} from '@/util/universalWalletKeyringFields';
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import {
  UNIVERSAL_WALLET_PASSWORD_NETWORKS,
  universalWalletLegacyNetworks,
  type UniversalWalletFunds,
  type UniversalWalletPasswordNetwork,
} from '@/util/universalWalletPassphrase';

/** Probes an address the recovery words alone open; anything it cannot confirm is `unknown`. */
export type UniversalWalletFundsProbe = (
  network: UniversalWalletPasswordNetwork,
  mnemonic: string,
  fields: UniversalWalletNetworkFields
) => Promise<UniversalWalletFunds>;

export type UniversalWalletSwitchOutcome = 'switched' | Exclude<UniversalWalletFunds, 'empty'>;

// What a derivation must reproduce: the address for Bitcoin and Solana, the public key for TON and Taira (their
// addresses only encode that key).
const identityKey: Record<UniversalWalletPasswordNetwork, keyof FWKeyringMeta> = {
  bitcoin: 'bitcoinAddress',
  bitcoinTestnet: 'bitcoinTestnetAddress',
  solana: 'solanaAddress',
  ton: 'tonPublicKeyHex',
  iroha: 'irohaPublicKeyHex',
};

const displayKey: Record<UniversalWalletPasswordNetwork, keyof FWKeyringMeta> = {
  bitcoin: 'bitcoinAddress',
  bitcoinTestnet: 'bitcoinTestnetAddress',
  solana: 'solanaAddress',
  ton: 'tonAddress',
  iroha: 'irohaAddress',
};

const publicAccountIds: Record<UniversalWalletPasswordNetwork, string[]> = {
  bitcoin: ['bitcoin-mainnet'],
  bitcoinTestnet: ['bitcoin-testnet'],
  solana: ['solana-mainnet'],
  ton: ['ton-mainnet'],
  iroha: ['iroha-taira', 'iroha-nexus'],
};

const normalizeIdentity = (network: UniversalWalletPasswordNetwork, value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  // Base58 (Solana) is case-sensitive; bech32 and hex are not.
  if (network === 'solana') return value;

  return value.replace(/^0x/i, '').toLowerCase();
};

export function universalWalletNetworkAddress(
  meta: FWKeyringMeta | undefined,
  network: UniversalWalletPasswordNetwork
): string | undefined {
  const value = meta?.[displayKey[network]];

  return typeof value === 'string' && value ? value : undefined;
}

/** The passphrase among `candidates` and '' that reproduces the stored account of `network`, if any does. */
export function matchUniversalWalletPassphrase(
  meta: FWKeyringMeta | undefined,
  network: UniversalWalletPasswordNetwork,
  mnemonic: string,
  candidates: readonly string[]
): string | undefined {
  const stored = normalizeIdentity(network, meta?.[identityKey[network]]);

  if (!stored) return undefined;

  for (const passphrase of new Set([...candidates.filter(Boolean), ''])) {
    try {
      const derived = deriveUniversalWalletNetworkFields(network, mnemonic, passphrase)[
        identityKey[network] as keyof UniversalWalletNetworkFields
      ];

      if (normalizeIdentity(network, derived) === stored) return passphrase;
    } catch {
      // A phrase that cannot open this network matches no candidate.
    }
  }

  return undefined;
}

type UniversalWalletSecretSource = {
  exportMnemonic(request: RequestExportSeed): ResponseExportSeed;
  universalWalletPassphraseCandidates?(address: string): string[];
};

/**
 * The recovery phrase with the BIP39 passphrase that opens the stored `network` account of `meta`: the wallet
 * password for accounts it protects, '' for wallets without one and every address the words alone open.
 */
export function exportUniversalWalletSecret(
  keyringService: UniversalWalletSecretSource,
  request: RequestExportSeed,
  network: UniversalWalletPasswordNetwork,
  meta: FWKeyringMeta | undefined
): { seed: string; passphrase: string } {
  const { seed } = keyringService.exportMnemonic(request);
  const candidates = seed ? keyringService.universalWalletPassphraseCandidates?.(request.address) ?? [] : [];

  return {
    seed,
    passphrase: candidates.length ? matchUniversalWalletPassphrase(meta, network, seed, candidates) ?? '' : '',
  };
}

/** Networks whose stored account the words alone open while the wallet has a password. */
export function findUniversalWalletLegacyNetworks(
  meta: FWKeyringMeta,
  mnemonic: string,
  passphrase: string
): UniversalWalletPasswordNetwork[] {
  if (!passphrase) return [];

  return UNIVERSAL_WALLET_PASSWORD_NETWORKS.filter(
    (network) => matchUniversalWalletPassphrase(meta, network, mnemonic, [passphrase]) === ''
  );
}

/**
 * The metadata after `switched` networks move to their password-protected accounts. Their public account
 * descriptors are rebuilt from the new fields; every other descriptor and field is kept.
 */
export function withProtectedUniversalWalletAccounts(
  address: string,
  meta: FWKeyringMeta,
  mnemonic: string,
  passphrase: string,
  switched: readonly UniversalWalletPasswordNetwork[]
): FWKeyringMeta {
  if (!switched.length) return meta;

  const fields = Object.assign(
    {},
    ...switched.map((network) => deriveUniversalWalletNetworkFields(network, mnemonic, passphrase))
  ) as UniversalWalletNetworkFields;
  const replacedIds = switched.flatMap((network) => publicAccountIds[network]);
  const remaining = universalWalletLegacyNetworks(meta.universalWalletLegacyNetworks).filter(
    (network) => !switched.includes(network)
  );
  const next: FWKeyringMeta = { ...meta, ...fields };

  if (remaining.length) next.universalWalletLegacyNetworks = remaining;
  else delete next.universalWalletLegacyNetworks;
  if (meta.universalWallet) {
    next.universalWallet = buildUniversalWalletKeyringMeta({
      address,
      meta: {
        ...next,
        universalWallet: {
          ...meta.universalWallet,
          publicAccounts: (meta.universalWallet.publicAccounts ?? []).filter(
            (account) => !replacedIds.includes(account?.accountId)
          ),
        },
      },
      walletEcosystem: next.walletEcosystem,
    });
  }

  return next;
}

export function hasUniversalWalletNetwork(meta: FWKeyringMeta, network: UniversalWalletPasswordNetwork): boolean {
  return universalWalletNetworkKeys(network).some((key) => !!meta[key]);
}

/** The Universal Wallet funds probe backed by the wallet's own balance clients. */
export function balanceServiceFundsProbe(balanceService: BalanceService): UniversalWalletFundsProbe {
  return async (network, mnemonic, fields) => {
    switch (network) {
      case 'bitcoin':
        return balanceService.bitcoinBalanceService.probeAccountFunds(mnemonic, 'mainnet');
      case 'bitcoinTestnet':
        return balanceService.bitcoinBalanceService.probeAccountFunds(mnemonic, 'testnet');
      case 'solana':
        return fields.solanaAddress ? balanceService.solanaBalanceService.probeAddressFunds(fields.solanaAddress) : 'unknown';
      case 'ton': {
        if (!fields.tonAddress) return 'unknown';

        const { activity, balance } =
          (await balanceService.tonBalanceService.fetchAddressActivity([fields.tonAddress]))[fields.tonAddress] ?? {};

        if (activity === 'unknown' || activity === undefined || balance === undefined) return 'unknown';

        return /[1-9]/.test(balance) ? 'funded' : 'empty';
      }
      case 'iroha':
        return fields.irohaAddress ? balanceService.irohaBalanceService.probeAddressFunds(fields.irohaAddress) : 'unknown';
    }
  };
}

/** Funds behind each network's no-password account; failures are `unknown`, never a guess. */
export async function probeUniversalWalletLegacyAccounts(
  probe: UniversalWalletFundsProbe,
  mnemonic: string,
  networks: readonly UniversalWalletPasswordNetwork[] = UNIVERSAL_WALLET_PASSWORD_NETWORKS
): Promise<{ network: UniversalWalletPasswordNetwork; address: string; funds: UniversalWalletFunds }[]> {
  return Promise.all(
    networks.map(async (network) => {
      const fields = deriveUniversalWalletNetworkFields(network, mnemonic, '');
      const address = String(fields[displayKey[network] as keyof UniversalWalletNetworkFields] ?? '');
      const funds: UniversalWalletFunds = await probe(network, mnemonic, fields).catch(() => 'unknown' as const);

      return { network, address, funds };
    })
  );
}
